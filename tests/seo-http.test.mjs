import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import next from 'next';
import pg from 'pg';
import { JSDOM } from 'jsdom';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('SEO HTTP: server-rendered public catalogue, canonical URLs, schemas, sitemap and real 404s', {skip:!databaseUrl}, async t=>{
  const schema=`tixo_seo_${randomUUID().replaceAll('-','')}`;
  const url=new URL(databaseUrl);url.searchParams.set('options',`-c search_path=${schema}`);
  const pool=new pg.Pool({connectionString:url.toString()});await pool.query(`CREATE SCHEMA ${schema}`);
  process.env.DATABASE_URL=url.toString();process.env.ADMIN_PASSWORD=randomUUID();process.env.SESSION_SECRET=randomUUID();
  globalThis.tihoPool=pool;globalThis.tihoSchemaReady=undefined;
  const app=next({dev:false,dir:process.cwd()});await app.prepare();
  const server=createServer(app.getRequestHandler());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await app.close();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();});
  assert.equal((await call('/api/products')).status,200);
  const form=Number((await pool.query("INSERT INTO candle_forms(name,shape,active) VALUES('SEO Змея','shell',TRUE) RETURNING id")).rows[0].id);
  const color=Number((await pool.query("INSERT INTO colors(name,hex,active) VALUES('SEO Изумруд','#12664f',TRUE) RETURNING id")).rows[0].id);
  const scent=Number((await pool.query("INSERT INTO scents(name,description,notes,active) VALUES('SEO MOJITO','Тестовый аромат',ARRAY['мята'],TRUE) RETURNING id")).rows[0].id);
  const insert=async(published,archived=false,stock=2)=>Number((await pool.query(`INSERT INTO products(name,category,notes,price,stock,published,archived,form_id,color_id,scent_id,volume_ml,images,image)
    VALUES('SEO Змея','','Описание </script><script id="seo-injected">bad</script>',2490,$1,$2,$3,$4,$5,$6,110,'["/assets/hero-real-candle.webp"]','/assets/hero-real-candle.webp') RETURNING id`,[stock,published,archived,form,color,scent])).rows[0].id);
  const id=await insert(true);const sold=await insert(true,false,0);const hidden=await insert(false);const archived=await insert(true,true);
  const before=(await pool.query('SELECT id,price,stock,published,archived FROM products ORDER BY id')).rows;
  const home=await call('/');assert.equal(home.status,200);const html=await home.text();const doc=new JSDOM(html).window.document;
  const anchor=doc.querySelector(`[data-product-id="${id}"] .product-title a`);assert.ok(anchor,'crawlable product link exists in initial HTML');
  const candlePath=anchor.getAttribute('href');assert.match(candlePath,new RegExp(`/candles/seo-zmeya-seo-izumrud-seo-mojito-${id}$`));
  assert.equal(doc.querySelectorAll('h1').length,1);assert.equal(doc.querySelector('link[rel="canonical"]').href,'https://www.tixocandle.ru/');assert.doesNotMatch(doc.body.textContent,/Готовим вашу коллекцию/);
  assert.equal(doc.querySelector(`[data-product-id="${hidden}"]`),null);assert.equal(doc.querySelector(`[data-product-id="${archived}"]`),null);
  assert.ok(doc.querySelector('meta[property="og:image"]').content.startsWith('https://www.tixocandle.ru/'));
  const detail=await call(candlePath);assert.equal(detail.status,200);const detailDoc=new JSDOM(await detail.text()).window.document;
  assert.equal(detailDoc.querySelector('link[rel="canonical"]').href,`https://www.tixocandle.ru${candlePath}`);assert.equal(detailDoc.querySelectorAll('h1').length,1);assert.match(detailDoc.title,/SEO MOJITO/);assert.match(detailDoc.querySelector('.detail-specs').textContent,/110 мл/);assert.equal(detailDoc.querySelector('#seo-injected'),null);
  const schemaData=JSON.parse(detailDoc.querySelector('script[type="application/ld+json"]').textContent);assert.equal(schemaData['@type'],'Product');assert.equal(schemaData.offers.price,2490);assert.equal(schemaData.offers.priceCurrency,'RUB');assert.equal(schemaData.offers.availability,'https://schema.org/InStock');assert.match(schemaData.description,/<\/script>/);
  const soldPath=doc.querySelector(`[data-product-id="${sold}"] .product-title a`).getAttribute('href');
  const soldDoc=new JSDOM(await(await call(soldPath)).text()).window.document;assert.equal(JSON.parse(soldDoc.querySelector('script[type="application/ld+json"]').textContent).offers.availability,'https://schema.org/OutOfStock');
  const sitemap=await call('/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();assert.ok(xml.includes(`https://www.tixocandle.ru${candlePath}`));assert.ok(xml.includes(soldPath));assert.ok(!xml.includes(`-${hidden}</loc>`));assert.ok(!xml.includes(`-${archived}</loc>`));assert.ok(!xml.includes('/admin'));assert.ok(!xml.includes('localhost'));
  const robots=await call('/robots.txt');assert.equal(robots.status,200);const rules=await robots.text();assert.match(rules,/Sitemap: https:\/\/www\.tixocandle\.ru\/sitemap.xml/);assert.doesNotMatch(rules,/Disallow: \/\s*$/m);assert.doesNotMatch(rules,/Disallow: \/admin/);
  for(const path of ['/privacy','/consent']){const page=new JSDOM(await(await call(path)).text()).window.document;assert.equal(page.querySelector('link[rel="canonical"]').href,`https://www.tixocandle.ru${path}`);assert.equal(page.querySelector('meta[property="og:url"]').content,`https://www.tixocandle.ru${path}`);}
  const admin=await call('/admin');assert.equal(admin.headers.get('x-robots-tag'),'noindex, nofollow');assert.match(await admin.text(),/name="robots" content="noindex, nofollow"/);assert.equal((await call('/api/admin/stats')).status,401);
  const redirected=await new Promise((resolve,reject)=>{const req=request(`${base}${candlePath}?from=test`,{headers:{host:'tixocandle.ru'}},res=>{res.resume();resolve({status:res.statusCode,location:res.headers.location});});req.on('error',reject);req.end();});assert.equal(redirected.status,301);assert.equal(redirected.location,`https://www.tixocandle.ru${candlePath}?from=test`);
  const renamed=await call(`/candles/old-title-${id}`);assert.equal(renamed.status,308);assert.equal(new URL(renamed.headers.get('location'),base).pathname,candlePath);
  for(const path of ['/does-not-exist','/candles/no-id',`/candles/hidden-${hidden}`,`/candles/archived-${archived}`,'/candles/missing-999999'])assert.equal((await call(path)).status,404,path);
  assert.deepEqual((await pool.query('SELECT id,price,stock,published,archived FROM products ORDER BY id')).rows,before,'SEO reads do not mutate catalogue records');
  await pool.query('UPDATE products SET published=FALSE WHERE id=$1',[id]);assert.equal((await call(candlePath)).status,404,'unpublishing takes effect without rebuild');assert.ok(!(await(await call('/sitemap.xml')).text()).includes(candlePath));
});
