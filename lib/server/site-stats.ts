import { getPool } from "./db";
import type { SitePage, SiteStats } from "../site-stats";
import { InputError } from "./validation";

declare global { var tihoStatsReady: Promise<void> | undefined; }
async function prepareStats() {
  global.tihoStatsReady ??= (async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(84173027)");
      // Only daily aggregates. No events, visitors, IPs, sessions or raw requests.
      await client.query(`CREATE TABLE IF NOT EXISTS site_page_counts (
        day DATE NOT NULL, path TEXT NOT NULL CHECK(path IN ('/','/privacy','/consent')),
        views BIGINT NOT NULL DEFAULT 0 CHECK(views >= 0), PRIMARY KEY(day,path)
      )`);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  })().catch(error => { global.tihoStatsReady = undefined; throw error; });
  return global.tihoStatsReady;
}

export async function countPageView(path: SitePage) {
  await prepareStats();
  await getPool().query(`INSERT INTO site_page_counts(day,path,views)
    VALUES((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date,$1,1)
    ON CONFLICT(day,path) DO UPDATE SET views=site_page_counts.views+1`, [path]);
}

export async function getSiteStats(value: string | null): Promise<SiteStats> {
  if (value !== null && !["7", "30", "90"].includes(value)) throw new InputError("Выберите период 7, 30 или 90 дней");
  const days = Number(value ?? 30);
  await prepareStats();
  const result = await getPool().query(`WITH clock AS (
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date AS today
    ), calendar AS (
      SELECT today - offset_days AS day FROM clock, generate_series(0,$1::int-1) offset_days
    ) SELECT jsonb_build_object(
      'days',$1::int, 'from',(today-($1::int-1))::text, 'to',today::text,
      'summary',(SELECT jsonb_build_object(
        'today',COALESCE(SUM(views) FILTER(WHERE day=today),0),
        'week',COALESCE(SUM(views) FILTER(WHERE day BETWEEN today-6 AND today),0),
        'month',COALESCE(SUM(views) FILTER(WHERE day BETWEEN today-29 AND today),0),
        'total',COALESCE(SUM(views) FILTER(WHERE day<=today),0)) FROM site_page_counts),
      'daily',(SELECT jsonb_agg(jsonb_build_object('date',day::text,'views',views) ORDER BY day)
        FROM (SELECT c.day,COALESCE(SUM(p.views),0) views FROM calendar c
          LEFT JOIN site_page_counts p ON p.day=c.day GROUP BY c.day) daily),
      'pages',COALESCE((SELECT jsonb_agg(jsonb_build_object('path',path,'views',views) ORDER BY views DESC,path)
        FROM (SELECT path,SUM(views) views FROM site_page_counts
          WHERE day BETWEEN today-($1::int-1) AND today GROUP BY path) pages),'[]'::jsonb)
    ) AS report FROM clock`, [days]);
  return result.rows[0].report;
}
