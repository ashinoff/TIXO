import { ensureSchema, getPool } from "./db";
const defaults: [string, string, number][] = [["Гипс", "г", 0.13], ["Воск", "г", 0.65], ["Отдушка", "г", 20], ["Фитиль", "шт", 5], ["Краска", "шт", 50], ["Упаковка S", "шт", 87], ["Упаковка L", "шт", 103], ["Доп. расходы", "усл. ед.", 10], ["Подставка S", "шт", 50], ["Подставка L", "шт", 80], ["Спички", "шт", 70]];

/** All schema changes and legacy links migrate together, without changing products or past snapshots. */
export async function prepareCosting() {
  await ensureSchema();
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(84173027)");
    await db.query(`CREATE TABLE IF NOT EXISTS costing_materials (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,unit TEXT NOT NULL,unit_price NUMERIC(14,4) NOT NULL CHECK(unit_price>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.query(`CREATE TABLE IF NOT EXISTS costing_recipes (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,markup_pct NUMERIC(9,2) NOT NULL DEFAULT 100,sale_price NUMERIC(14,2),items JSONB NOT NULL DEFAULT '{}'::jsonb,note TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.query("ALTER TABLE costing_recipes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1");
    await db.query(`CREATE TABLE IF NOT EXISTS costing_history (id BIGSERIAL PRIMARY KEY,recipe_id BIGINT REFERENCES costing_recipes(id) ON DELETE SET NULL,snapshot JSONB NOT NULL,saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.query(`CREATE TABLE IF NOT EXISTS costing_recipe_products (recipe_id BIGINT NOT NULL REFERENCES costing_recipes(id) ON DELETE CASCADE,product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,PRIMARY KEY(recipe_id,product_id))`);
    await db.query("CREATE INDEX IF NOT EXISTS costing_recipe_products_product_idx ON costing_recipe_products(product_id)");
    const seeded = await db.query("INSERT INTO app_migrations(key) VALUES('costing-seed-materials-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (seeded.rowCount) for (const [name, unit, price] of defaults) await db.query("INSERT INTO costing_materials(name,unit,unit_price) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING", [name, unit, price]);
    const imported = await db.query("INSERT INTO app_migrations(key) VALUES('costing-example-pumpkin-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (imported.rowCount) {
      const units = [300,85,8,1,1,0,1,1,0,1,1];
      const rows = await db.query("SELECT id,name FROM costing_materials WHERE name=ANY($1::text[])", [defaults.map(item => item[0])]);
      const byName = new Map(rows.rows.map(row => [row.name, String(row.id)]));
      const items: Record<string, number> = {};
      defaults.forEach(([name], index) => { const key = byName.get(name); if (key && units[index]) items[key] = units[index]; });
      await db.query("INSERT INTO costing_recipes(name,markup_pct,sale_price,items,note) VALUES($1,$2,$3,$4::jsonb,$5)", ["Тыква",100,1300,JSON.stringify(items),"Импорт из файла «калькулятор.xlsx»: 572,25 ₽ на 1 шт."]);
    }
    const linked = await db.query("INSERT INTO app_migrations(key) VALUES('costing-product-links-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (linked.rowCount) await db.query("INSERT INTO costing_recipe_products(recipe_id,product_id) SELECT id,product_id FROM costing_recipes WHERE product_id IS NOT NULL ON CONFLICT DO NOTHING");
    await db.query(`CREATE TABLE IF NOT EXISTS costing_expenses (
      id BIGSERIAL PRIMARY KEY, spent_on DATE NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
      version INTEGER NOT NULL DEFAULT 1, archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("CREATE INDEX IF NOT EXISTS costing_expenses_date_idx ON costing_expenses(spent_on) WHERE NOT archived");
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

