import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { InputError } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const defaults: [string, string, number][] = [["Гипс", "г", 0.13], ["Воск", "г", 0.65], ["Отдушка", "г", 20], ["Фитиль", "шт", 5], ["Краска", "шт", 50], ["Упаковка S", "шт", 87], ["Упаковка L", "шт", 103], ["Доп. расходы", "усл. ед.", 10], ["Подставка S", "шт", 50], ["Подставка L", "шт", 80], ["Спички", "шт", 70]];
const headers = { "Cache-Control": "no-store" };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
function numeric(value: unknown, max = 100000000): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new InputError("Укажите корректное неотрицательное число");
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > max) throw new InputError("Укажите корректное неотрицательное число");
  return result;
}
function id(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) throw new InputError("Некорректный идентификатор записи");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new InputError("Некорректный идентификатор записи");
  return result;
}
function ids(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 1000) throw new InputError("Выберите не более 1000 товаров для одной калькуляции");
  return [...new Set(value.map(id))].sort((a, b) => a - b);
}
function mapRecipe(row: Record<string, unknown>) {
  const productIds = ids(row.product_ids ?? []);
  return { ...row, id: id(row.id), product_ids: productIds, product_id: productIds.length === 1 ? productIds[0] : null,
    version: Number(row.version), markup_pct: Number(row.markup_pct), sale_price: row.sale_price == null ? null : Number(row.sale_price) };
}
const recipeQuery = `SELECT r.*, ARRAY(SELECT l.product_id FROM costing_recipe_products l WHERE l.recipe_id=r.id ORDER BY l.product_id) AS product_ids FROM costing_recipes r`;
const productQuery = `SELECT p.id,p.name,p.price,p.published,p.archived,c.name AS color_name,a.name AS accent_color_name,s.name AS scent_name,f.name AS form_name
  FROM products p LEFT JOIN colors c ON c.id=p.color_id LEFT JOIN colors a ON a.id=p.accent_color_id
  LEFT JOIN scents s ON s.id=p.scent_id LEFT JOIN candle_forms f ON f.id=p.form_id`;

/** All schema changes and legacy links migrate together, without changing products or past snapshots. */
async function prepare() {
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
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers });
  try {
    await prepare();
    const db = getPool();
    const [materials, recipes, history, products] = await Promise.all([
      db.query("SELECT id,name,unit,unit_price AS price FROM costing_materials ORDER BY id"),
      db.query(`${recipeQuery} ORDER BY r.updated_at DESC,r.id DESC`),
      db.query("SELECT id,recipe_id,snapshot,saved_at FROM costing_history ORDER BY id DESC LIMIT 50"),
      db.query(`${productQuery} WHERE NOT p.archived OR EXISTS(SELECT 1 FROM costing_recipe_products l WHERE l.product_id=p.id) ORDER BY p.archived,p.catalog_position NULLS LAST,p.id`),
    ]);
    // pg returns BIGINT IDs as strings. Type annotations alone cannot fix JSON at runtime.
    return NextResponse.json({
      materials: materials.rows.map(row => ({ ...row, id: id(row.id), price: Number(row.price) })),
      recipes: recipes.rows.map(mapRecipe),
      history: history.rows.map(row => ({ ...row, id: id(row.id), recipe_id: row.recipe_id == null ? null : id(row.recipe_id) })),
      products: products.rows.map(row => ({ ...row, id: id(row.id), price: Number(row.price) })),
    }, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers });
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Некорректные данные запроса");
    await prepare();
    if (body.action === "material") {
      const name = String(body.name ?? "").trim(), unit = String(body.unit ?? "").trim();
      if (!name || name.length > 160 || !unit || unit.length > 32) throw new InputError("Укажите название материала и единицу");
      const price = numeric(body.price);
      if (body.id != null && body.id !== 0 && body.id !== "0") {
        const result = await getPool().query("UPDATE costing_materials SET name=$1,unit=$2,unit_price=$3,updated_at=NOW() WHERE id=$4", [name, unit, price, id(body.id)]);
        if (!result.rowCount) throw new InputError("Материал не найден", 404);
      } else await getPool().query("INSERT INTO costing_materials(name,unit,unit_price) VALUES($1,$2,$3)", [name, unit, price]);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === "remove-recipe") {
      const result = await getPool().query("DELETE FROM costing_recipes WHERE id=$1 AND ($2::integer IS NULL OR version=$2)", [id(body.id), body.expected_version == null ? null : id(body.expected_version)]);
      if (!result.rowCount) throw new InputError("Калькуляция уже изменена или удалена. Обновите список.", 409);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action !== "recipe") throw new InputError("Некорректная операция");
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 160) throw new InputError("Укажите название расчёта до 160 символов");
    if (!body.items || typeof body.items !== "object" || Array.isArray(body.items) || Object.keys(body.items).length > 150) throw new InputError("Некорректная рецептура");
    const recipeId = body.id == null || body.id === 0 || body.id === "0" ? null : id(body.id);
    const markup = numeric(body.markup_pct, 100000), sale = body.sale_price == null || body.sale_price === "" ? null : numeric(body.sale_price);
    const note = String(body.note ?? "");
    if (note.length > 2000) throw new InputError("Примечание: не более 2000 символов");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const previous = recipeId ? (await client.query("SELECT * FROM costing_recipes WHERE id=$1 FOR UPDATE", [recipeId])).rows[0] : null;
      if (recipeId && !previous) throw new InputError("Калькуляция не найдена", 404);
      if (previous && body.expected_version != null && id(body.expected_version) !== Number(previous.version)) throw new InputError("Калькуляция уже изменена в другой вкладке. Обновите список; ваш черновик сохранён на экране.", 409);
      const existing = recipeId ? (await client.query("SELECT product_id FROM costing_recipe_products WHERE recipe_id=$1 ORDER BY product_id", [recipeId])).rows.map(row => id(row.product_id)) : [];
      let selected = existing;
      if (Object.hasOwn(body, "product_ids")) selected = ids(body.product_ids);
      else if (Object.hasOwn(body, "product_id")) {
        if (existing.length > 1) throw new InputError("У калькуляции несколько товаров. Обновите страницу перед редактированием.", 409);
        selected = body.product_id == null || body.product_id === "" ? [] : [id(body.product_id)];
      }
      const linked = selected.length ? (await client.query(`${productQuery} WHERE p.id=ANY($1::bigint[]) ORDER BY p.id FOR SHARE OF p`, [selected])).rows : [];
      if (linked.length !== selected.length || linked.some(row => row.archived && !existing.includes(id(row.id)))) throw new InputError("Один из выбранных товаров удалён или недоступен. Обновите список товаров.", 409);
      const materials = (await client.query("SELECT id,name,unit,unit_price AS price FROM costing_materials ORDER BY id FOR SHARE")).rows;
      const valid = new Set(materials.map(row => String(row.id))), quantities: Record<string, number> = {};
      for (const [key, value] of Object.entries(body.items)) { if (!valid.has(key)) throw new InputError("Материал больше недоступен. Обновите прайс.", 409); quantities[key] = numeric(value); }
      const total = round(materials.reduce((sum, m) => sum + (quantities[m.id] ?? 0) * Number(m.price), 0));
      if (total > Number.MAX_SAFE_INTEGER / 100) throw new InputError("Сумма расчёта слишком велика");
      const values = [name, selected.length === 1 ? selected[0] : null, markup, sale, JSON.stringify(quantities), note];
      const saved = previous
        ? (await client.query("UPDATE costing_recipes SET name=$1,product_id=$2,markup_pct=$3,sale_price=$4,items=$5::jsonb,note=$6,version=version+1,updated_at=NOW() WHERE id=$7 RETURNING *", [...values, recipeId])).rows[0]
        : (await client.query("INSERT INTO costing_recipes(name,product_id,markup_pct,sale_price,items,note) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *", values)).rows[0];
      const actual = id(saved.id);
      await client.query("DELETE FROM costing_recipe_products WHERE recipe_id=$1", [actual]);
      if (selected.length) await client.query("INSERT INTO costing_recipe_products(recipe_id,product_id) SELECT $1,unnest($2::bigint[])", [actual, selected]);
      const snapshot = { name, items: materials.filter(m => quantities[m.id] > 0).map(m => ({ name: m.name, unit: m.unit, quantity: quantities[m.id], unit_price: Number(m.price) })), total,
        markup_pct: markup, sale_price: sale, recommended: round(total * (1 + markup / 100)), profit: sale == null ? null : round(sale - total), margin: sale ? round((sale - total) / sale * 100) : null, note,
        product_ids: selected, products: linked.map(p => ({ id: id(p.id), name: p.name, color_name: p.color_name, accent_color_name: p.accent_color_name, scent_name: p.scent_name, price: Number(p.price), profit: round(Number(p.price) - total), margin: p.price ? round((Number(p.price) - total) / Number(p.price) * 100) : null })) };
      await client.query("INSERT INTO costing_history(recipe_id,snapshot) VALUES($1,$2::jsonb)", [actual, JSON.stringify(snapshot)]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, id: actual, recipe: mapRecipe({ ...saved, product_ids: selected }) }, { headers });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) { return apiError(error); }
}
