import { ensureSchema, getPool, listProducts } from "./db";
import { saveImage, removeImage } from "./uploads";
import { InputError, integer, textValue } from "./validation";
import { MAX_PRODUCT_IMAGES, MAX_PRODUCT_VOLUME_ML, productImages } from "../catalog";

type PhotoChoice = { url: string } | { upload: number };
function photoPlan(form: FormData, previous: string[]): { choices: PhotoChoice[]; files: File[] } {
  if (form.has("expectedImages")) {
    if (form.get("expectedImages") !== JSON.stringify(previous)) throw new InputError("Фотографии уже изменились. Откройте карточку заново перед сохранением.", 409);
  }
  if (!form.has("photos")) {
    // Older admin clients may still submit a single photograph.
    const file = form.get("image");
    if (file instanceof File && file.size) return { choices: [{ upload: 0 }], files: [file] };
    return { choices: (form.get("removeImage") === "true" ? [] : previous).map(url => ({ url })), files: [] };
  }
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("photos"))); } catch { throw new InputError("Проверьте список фотографий"); }
  if (!Array.isArray(raw) || raw.length > MAX_PRODUCT_IMAGES) throw new InputError(`Добавьте не более ${MAX_PRODUCT_IMAGES} фотографий`);
  const uploads = form.getAll("images");
  if (uploads.some(file => !(file instanceof File) || !file.size) || uploads.length > MAX_PRODUCT_IMAGES) throw new InputError("Проверьте загруженные фотографии");
  const files = uploads as File[];
  const used = new Set<string>();
  const choices = raw.map((item): PhotoChoice => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 1) throw new InputError("Проверьте список фотографий");
    if (typeof item.url === "string" && previous.includes(item.url) && !used.has(item.url)) { used.add(item.url); return { url: item.url }; }
    if (Number.isSafeInteger(item.upload) && item.upload >= 0 && item.upload < files.length && !used.has(`upload:${item.upload}`)) { used.add(`upload:${item.upload}`); return { upload: item.upload }; }
    throw new InputError("Фотография недоступна. Обновите карточку свечи.");
  });
  if (choices.filter(choice => "upload" in choice).length !== files.length) throw new InputError("Проверьте порядок загруженных фотографий");
  return { choices, files };
}

export async function saveProduct(form: FormData, id?: number) {
  const formId = integer(form.get("formId"), "Форма", 1);
  const colorId = integer(form.get("colorId"), "Цвет", 1);
  const requestedAccent = form.get("accentColorId");
  const accentColorId = requestedAccent ? integer(requestedAccent, "Цвет декора", 1) : null;
  const scentId = integer(form.get("scentId"), "Аромат", 1);
  const notes = textValue(form.get("notes") ?? "", "Описание свечи", 2000, false);
  // Missing fields from older editors preserve the saved volume; an empty field clears it.
  const requestedVolume = form.get("volumeMl");
  const volumeMl = !form.has("volumeMl") ? undefined : requestedVolume === "" ? null : integer(requestedVolume, "Объём, мл", 1, MAX_PRODUCT_VOLUME_ML);
  const price = integer(form.get("price"), "Цена", 0, 10000000);
  const stock = integer(form.get("stock"), "Остаток", 0, 1000000);
  const published = form.get("published") === "true";
  const expectedStock = id ? integer(form.get("expectedStock"), "Исходный остаток", 0, 1000000) : null;
  await ensureSchema();
  const db = await getPool().connect();
  const newImages: string[] = [];
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
    const accentColor = accentColorId ? (await db.query("SELECT * FROM colors WHERE id=$1 FOR SHARE", [accentColorId])).rows[0] : null;
    if (accentColorId && (!accentColor || !candleForm.two_tone)) throw new InputError("Цвет декора доступен только для двухцветной формы", 409);
    if (published && (!candleForm.active || !color.active || !scent.active || (accentColor && !accentColor.active))) throw new InputError("Для публикации включите выбранные форму, цвет и аромат в справочниках.", 409);
    if (old && (Number(old.form_id) !== formId || Number(old.color_id) !== colorId || Number(old.scent_id) !== scentId || (old.accent_color_id ? Number(old.accent_color_id) : null) !== accentColorId)) {
      const reserved = await db.query(`SELECT 1 FROM orders o WHERE o.stock_reserved AND o.status<>'completed'
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$1
          OR (item->>'productId'=$2 AND item->>'variantId'=$3)) LIMIT 1`, [String(id), String(old.legacy_parent_id ?? ""), String(old.legacy_variant_id ?? "")]);
      if (reserved.rowCount) throw new InputError("У этой свечи есть незавершённые заказы. Сначала завершите или отмените их, либо создайте новую свечу с другим сочетанием.", 409);
    }
    const { choices, files } = photoPlan(form, productImages(old ?? {}));
    for (const file of files) if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new InputError("Фото: JPG, PNG или WebP, не более 10 МБ каждое");
    for (const file of files) newImages.push(await saveImage(file));
    const images = choices.map(choice => "url" in choice ? choice.url : newImages[choice.upload]);
    const values = [candleForm.name, notes, price, stock, published, images[0] ?? null, formId, colorId, scentId, candleForm.shape, JSON.stringify(images), accentColorId, volumeMl === undefined ? old?.volume_ml ?? null : volumeMl];
    if (id) await db.query(`UPDATE products SET name=$1,notes=$2,price=$3,stock=$4,published=$5,image=$6,
      form_id=$7,color_id=$8,scent_id=$9,shape=$10,images=$11::jsonb,accent_color_id=$12,volume_ml=$13,updated_at=NOW() WHERE id=$14`, [...values, id]);
    else productId = Number((await db.query(`INSERT INTO products(name,notes,price,stock,published,image,form_id,color_id,scent_id,shape,images,accent_color_id,volume_ml,category)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'') RETURNING id`, values)).rows[0].id);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    await Promise.all(newImages.map(removeImage));
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

/** Reorder complete catalog snapshots; reject stale tabs rather than overwrite another edit. */
export async function reorderProducts(body: unknown) {
  const input = body as { ids?: unknown; expectedIds?: unknown } | null;
  const validIds = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 10000
    && value.every(id => typeof id === "number" && Number.isSafeInteger(id) && id > 0)
    && new Set(value).size === value.length;
  if (!input || !validIds(input.ids) || !validIds(input.expectedIds)) {
    throw new InputError("Проверьте порядок свечей");
  }
  const { ids, expectedIds } = input;
  const expected = new Set(expectedIds);
  if (ids.length !== expectedIds.length || ids.some(id => !expected.has(id))) throw new InputError("Проверьте порядок свечей");
  await ensureSchema();
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    // Also serialize creation/archive with the snapshot check. Stock and orders are untouched.
    await db.query("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE");
    const current = (await db.query("SELECT id FROM products WHERE NOT archived ORDER BY catalog_position NULLS LAST,id")).rows.map(row => Number(row.id));
    if (current.length !== expectedIds.length || current.some((id, index) => id !== expectedIds[index])) {
      throw new InputError("Каталог уже изменился. Обновите список и повторите перестановку.", 409);
    }
    await db.query(`UPDATE products p SET catalog_position=ordered.position
      FROM unnest($1::bigint[]) WITH ORDINALITY AS ordered(id,position) WHERE p.id=ordered.id`, [ids]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
  return listProducts(true);
}
