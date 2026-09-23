import { ensureSchema, getPool, listProducts } from "./db";
import { saveImage, removeImage } from "./uploads";
import { InputError, integer, textValue } from "./validation";

export async function saveProduct(form: FormData, id?: number) {
  const formId = integer(form.get("formId"), "Форма", 1);
  const colorId = integer(form.get("colorId"), "Цвет", 1);
  const scentId = integer(form.get("scentId"), "Аромат", 1);
  const notes = textValue(form.get("notes") ?? "", "Описание свечи", 2000, false);
  const price = integer(form.get("price"), "Цена", 0, 10000000);
  const stock = integer(form.get("stock"), "Остаток", 0, 1000000);
  const published = form.get("published") === "true";
  const expectedStock = id ? integer(form.get("expectedStock"), "Исходный остаток", 0, 1000000) : null;
  await ensureSchema();
  const db = await getPool().connect();
  let newImage: string | null = null;
  let productId = id;
  try {
    await db.query("BEGIN");
    const old = id ? (await db.query("SELECT * FROM products WHERE id=$1 AND NOT archived FOR UPDATE", [id])).rows[0] : null;
    if (id && !old) throw new InputError("Свеча не найдена", 404);
    if (old && expectedStock !== old.stock) throw new InputError("Остаток изменился. Закройте карточку и обновите данные перед сохранением.", 409);
    const candleForm = (await db.query("SELECT * FROM candle_forms WHERE id=$1 FOR SHARE", [formId])).rows[0];
    const color = (await db.query("SELECT * FROM colors WHERE id=$1 FOR SHARE", [colorId])).rows[0];
    const scent = (await db.query("SELECT * FROM scents WHERE id=$1 FOR SHARE", [scentId])).rows[0];
    if (!candleForm || !color || !scent) throw new InputError("Форма, цвет или аромат больше не существуют. Обновите справочники.", 409);
    if (published && (!candleForm.active || !color.active || !scent.active)) throw new InputError("Для публикации включите выбранные форму, цвет и аромат в справочниках.", 409);
    if (old && (Number(old.form_id) !== formId || Number(old.color_id) !== colorId || Number(old.scent_id) !== scentId)) {
      const reserved = await db.query(`SELECT 1 FROM orders o WHERE o.stock_reserved AND o.status<>'completed'
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$1
          OR (item->>'productId'=$2 AND item->>'variantId'=$3)) LIMIT 1`, [String(id), String(old.legacy_parent_id ?? ""), String(old.legacy_variant_id ?? "")]);
      if (reserved.rowCount) throw new InputError("У этой свечи есть незавершённые заказы. Сначала завершите или отмените их, либо создайте новую свечу с другим сочетанием.", 409);
    }
    const file = form.get("image");
    if (file instanceof File && file.size) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new InputError("Фото: JPG, PNG или WebP, не более 10 МБ");
      newImage = await saveImage(file);
    }
    const image = newImage ?? old?.image ?? null;
    const values = [candleForm.name, notes, price, stock, published, image, formId, colorId, scentId, candleForm.shape];
    if (id) await db.query(`UPDATE products SET name=$1,notes=$2,price=$3,stock=$4,published=$5,image=$6,
      form_id=$7,color_id=$8,scent_id=$9,shape=$10,updated_at=NOW() WHERE id=$11`, [...values, id]);
    else productId = Number((await db.query(`INSERT INTO products(name,notes,price,stock,published,image,form_id,color_id,scent_id,shape,category)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'') RETURNING id`, values)).rows[0].id);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    if (newImage) await removeImage(newImage);
    throw error;
  } finally { db.release(); }
  return (await listProducts(true, productId))[0];
}

export async function updateStock(id: number, body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Проверьте остаток");
  const stock = integer(body.stock, "Остаток", 0, 1000000);
  const expected = integer(body.expectedStock, "Исходный остаток", 0, 1000000);
  await ensureSchema();
  const result = await getPool().query("UPDATE products SET stock=$1,updated_at=NOW() WHERE id=$2 AND stock=$3 AND NOT archived RETURNING id", [stock, id, expected]);
  if (!result.rowCount) throw new InputError("Остаток уже изменился или свеча удалена. Закройте окно и обновите данные.", 409);
  return (await listProducts(true, id))[0];
}
