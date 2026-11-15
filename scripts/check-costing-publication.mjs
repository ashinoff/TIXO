// Read-only verification: no admin login, order creation, catalogue edits or database writes.
const origin = new URL(process.env.PUBLICATION_ORIGIN || 'https://tixo-mia-ashinoff.mia0.amvera.tech/');
const attempts = Number(process.env.PUBLICATION_ATTEMPTS || 12);
const delay = Number(process.env.PUBLICATION_DELAY_MS || 10000);
const stamp = process.env.GITHUB_SHA || 'anonymous-counter-v1';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function read(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
let failure = 'New admin bundle not observed';
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    const url = new URL('/admin', origin); url.searchParams.set('verify', `${stamp}-${attempt}`);
    const html = await read(url);
    const sources = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&')))];
    const assets = sources.map(src => new URL(src, origin)).filter(src => src.origin === origin.origin && src.pathname.startsWith('/_next/static/'));
    if (!assets.length) throw new Error('No Next.js scripts in the public admin page');
    const markers = new Set(['costing-product-picker', 'product_ids', 'costing-material-editor', 'trade-dashboard', 'trade-expense-form', '/api/admin/reports/export', 'site-statistics', '/api/admin/stats?days=']);
    let verified = false;
    // Limit concurrent downloads; the marker is in the admin client bundle, not customer data.
    for (let i = 0; i < assets.length && !verified; i += 4) {
      const texts = await Promise.all(assets.slice(i, i + 4).map(async asset => { try { return await read(asset); } catch { return ''; } }));
      for (const text of texts) for (const marker of markers) if (text.includes(marker)) markers.delete(marker);
      verified = markers.size === 0;
    }
    if (!verified) throw new Error('The domain still serves the previous admin bundle');
    const storefront = await read(new URL(`/?verify=${stamp}-${attempt}`, origin));
    const counterScripts = [...new Set([...storefront.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&')))];
    let counterFound = false;
    for (const src of counterScripts) {
      const asset = new URL(src, origin);
      if (asset.origin !== origin.origin || !asset.pathname.startsWith('/_next/static/')) continue;
      if ((await read(asset)).includes('/api/stats/pageview')) { counterFound = true; break; }
    }
    if (!counterFound) throw new Error('The storefront counter bundle has not been published');
    for (const path of ['/api/admin/reports', '/api/admin/reports/export', '/api/admin/stats']) {
      const response = await fetch(new URL(path, origin), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (response.status !== 401) throw new Error(`Expected protected report endpoint ${path}, got HTTP ${response.status}`);
    }
    console.log(`Confirmed anonymous counter, admin statistics, material editor, trade reports and protected APIs on ${origin.host}. Read-only verification: no pageview submitted.`);
    process.exit(0);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.log(`Publication check ${attempt}/${attempts}: ${failure}`);
  }
  if (attempt < attempts) await pause(delay);
}
console.error(`Publication was NOT confirmed: ${failure}. Check Amvera deployment and GitHub webhook delivery; passing build tests alone is not deployment.`);
process.exit(1);
