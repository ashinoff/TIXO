import { getPool } from "./db";
import { prepareCosting } from "./costing";
import { InputError, integer, textValue } from "./validation";
import { buildTradeReport, type ReportPeriod, type TradeSource } from "../trade-report";

export function parsePeriod(params: URLSearchParams): ReportPeriod {
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  for (const value of [from, to]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31" || (!Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value))) throw new InputError("Укажите корректные даты периода");
  if (from && to && from > to) throw new InputError("Начало периода позже окончания");
  return { from, to };
}

/** Stock, reservations, prices and calculations come from one consistent read-only snapshot. */
export async function loadTradeSource(): Promise<TradeSource> {
  await prepareCosting();
  const db = await getPool().connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const products = await db.query(`SELECT p.*,COALESCE(f.name,p.name) AS display_name,f.name AS form_name,c.name AS color_name,a.name AS accent_name,s.name AS scent_name,
      p.published AND NOT p.archived AND COALESCE(f.active,TRUE) AND COALESCE(c.active,TRUE) AND COALESCE(a.active,TRUE) AND COALESCE(s.active,TRUE) AS visible
      FROM products p LEFT JOIN candle_forms f ON f.id=p.form_id LEFT JOIN colors c ON c.id=p.color_id LEFT JOIN colors a ON a.id=p.accent_color_id LEFT JOIN scents s ON s.id=p.scent_id
      ORDER BY p.archived,p.catalog_position NULLS LAST,p.id`);
    const materials = await db.query("SELECT id,name,unit,unit_price AS price FROM costing_materials ORDER BY id");
    const recipes = await db.query("SELECT r.*,ARRAY(SELECT product_id FROM costing_recipe_products l WHERE l.recipe_id=r.id ORDER BY product_id) AS product_ids FROM costing_recipes r ORDER BY r.updated_at DESC,r.id DESC");
    const orders = await db.query("SELECT * FROM orders ORDER BY created_at DESC,id DESC");
    const expenses = await db.query("SELECT id,spent_on::text AS date,category,description,amount,version FROM costing_expenses WHERE NOT archived ORDER BY spent_on DESC,id DESC");
    const history = await db.query("SELECT id,recipe_id,snapshot,saved_at FROM costing_history ORDER BY id DESC");
    await db.query("COMMIT");
    return {
      products: products.rows.map(p => ({ id: Number(p.id), name: p.display_name, form: p.form_name ?? "", color: p.color_name ?? "", accent: p.accent_name ?? "", scent: p.scent_name ?? "", stock: Number(p.stock), price: Number(p.price), published: p.published, visible: p.visible, archived: p.archived, legacyVariantId: p.legacy_variant_id == null ? null : Number(p.legacy_variant_id), volume: p.volume_ml == null ? null : Number(p.volume_ml) })),
      materials: materials.rows.map(m => ({ ...m, id: Number(m.id), price: Number(m.price) })),
      recipes: recipes.rows.map(r => ({ id: Number(r.id), name: r.name, productIds: r.product_ids.map(Number), items: r.items, markup: Number(r.markup_pct), salePrice: r.sale_price == null ? null : Number(r.sale_price), note: r.note, updatedAt: new Date(r.updated_at).toISOString() })),
      orders: orders.rows.map(o => ({ id: Number(o.id), number: o.order_number ?? String(o.id), createdAt: new Date(o.created_at).toISOString(), status: o.status, stockReserved: o.stock_reserved, total: Number(o.total), customer: o.customer_name, phone: o.phone, email: o.email, delivery: o.delivery, address: o.address, comment: o.comment, channels: o.messenger_channels ?? [], items: Array.isArray(o.items) ? o.items : [] })),
      expenses: expenses.rows.map(e => ({ ...e, id: Number(e.id), amount: Number(e.amount) })),
      history: history.rows.map(h => ({ id: Number(h.id), recipeId: h.recipe_id == null ? null : Number(h.recipe_id), savedAt: new Date(h.saved_at).toISOString(), name: h.snapshot.name, total: Number(h.snapshot.total), salePrice: h.snapshot.sale_price == null ? null : Number(h.snapshot.sale_price), note: h.snapshot.note ?? "" })),
    };
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
export async function getTradeReport(period: ReportPeriod) { return buildTradeReport(await loadTradeSource(), period); }

export async function saveExpense(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Некорректные данные расхода");
  const id = body.id ? integer(body.id, "Номер расхода", 1) : null;
  const version = id ? integer(body.version, "Версия расхода", 1) : null;
  if (body.action !== "expense" && body.action !== "remove-expense") throw new InputError("Неизвестная операция");
  if (body.action === "remove-expense" && !id) throw new InputError("Не указан расход");
  await prepareCosting();
  if (body.action === "remove-expense") {
    const result = await getPool().query("UPDATE costing_expenses SET archived=TRUE,version=version+1,updated_at=NOW() WHERE id=$1 AND version=$2 AND NOT archived", [id, version]);
    if (!result.rowCount) throw new InputError("Расход уже изменён или удалён. Обновите список.", 409);
    return;
  }
  const date = textValue(body.date, "Дата расхода", 10);
  parsePeriod(new URLSearchParams({ from: date, to: date }));
  const category = textValue(body.category, "Категория расхода", 80), description = textValue(body.description ?? "", "Описание расхода", 1000, false);
  if ((typeof body.amount !== "number" && typeof body.amount !== "string") || !/^\d+(\.\d{1,2})?$/.test(String(body.amount)) || Number(body.amount) <= 0 || Number(body.amount) > 100000000) throw new InputError("Сумма расхода: от 0,01 до 100 000 000 ₽, не более двух знаков после запятой");
  const values = [date, category, description, Number(body.amount)];
  if (id) {
    const result = await getPool().query("UPDATE costing_expenses SET spent_on=$1,category=$2,description=$3,amount=$4,version=version+1,updated_at=NOW() WHERE id=$5 AND version=$6 AND NOT archived", [...values, id, version]);
    if (!result.rowCount) throw new InputError("Расход уже изменён или удалён. Обновите список.", 409);
  } else await getPool().query("INSERT INTO costing_expenses(spent_on,category,description,amount) VALUES($1,$2,$3,$4)", values);
}
