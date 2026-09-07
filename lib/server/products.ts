import { ensureSchema, getPool, listProducts } from "./db";
import { saveImage, removeImage } from "./uploads";
import { InputError, integer, textValue } from "./validation";
import { candleShapes } from "../catalog";

type VariantInput = { scentId: number; stock: number; expectedStock?: number; active: boolean; useMainImage: boolean };

export async function saveProduct(form: FormData, id?: number) {
  const name = textValue(form.get("name"), "Название формы", 160);
  const notes = textValue(form.get("notes") ?? "", "Описание формы", 2000, false);
  const price = integer(form.get("price"), "Цена", 0, 10000000);
  const stock = integer(form.get("stock"), "Остаток", 0, 1000000);
  const published = form.get("published") === "true";
  const shape = form.get("shape");
  if (shape !== null && (typeof shape !== "string" || !Object.hasOwn(candleShapes, shape))) throw new InputError("Выберите форму для предпросмотра");
  const payload = form.get("variants");
  let variants: VariantInput[] | undefined;
  if (payload !== null) {
    const value = JSON.parse(String(payload));
    if (!Array.isArray(value) || value.length > 80) throw new InputError("Укажите не более 80 вариантов");
    variants = value.map(item => {
      if (!item || typeof item.active !== "boolean") throw new InputError("Проверьте варианты");
      return { scentId: integer(item.scentId, "Аромат", 1), stock: integer(item.stock, "Остаток варианта", 0, 1000000),
        expectedStock: item.expectedStock == null ? undefined : integer(item.expectedStock, "Исходный остаток", 0, 1000000),
        active: item.active, useMainImage: item.useMainImage === true };
    });
    if (new Set(variants.map(v => v.scentId)).size !== variants.length) throw new InputError("Аромат не может повторяться в одной форме");
  }
  await ensureSchema();
  const db = await getPool().connect();
  const newImages: string[] = [];
  const upload = async (value: FormDataEntryValue | null) => {
    if (!(value instanceof File) || !value.size) return null;
    if (!["image/jpeg", "image/png", "image/webp"].includes(value.type) || value.size > 10 * 1024 * 1024) throw new InputError("Фото: JPG, PNG или WebP, не более 10 МБ");
    const image = await saveImage(value); newImages.push(image); return image;
  };
  let productId = id;
  try {
    await db.query("BEGIN");
    const previous = id ? await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [id]) : null;
    if (id && !previous?.rowCount) throw new InputError("Товар не найден", 404);
    const old = previous?.rows[0];
    const existing = id ? (await db.query("SELECT * FROM product_variants WHERE product_id=$1 ORDER BY id FOR UPDATE", [id])).rows : [];
    if (variants && existing.some(v => !variants.some(input => input.scentId === Number(v.scent_id)))) throw new InputError("Состав вариантов изменился. Откройте карточку заново; существующий вариант можно отключить.", 409);
    if (!existing.length && old && form.has("expectedStock") && integer(form.get("expectedStock"), "Исходный остаток") !== old.stock) throw new InputError("Остаток изменился после нового заказа. Откройте карточку заново.", 409);
    const image = await upload(form.get("image")) ?? old?.image ?? null;
    if (id) {
      await db.query("UPDATE products SET name=$1,notes=$2,price=$3,published=$4,image=$5,updated_at=NOW() WHERE id=$6", [name, notes, price, published, image, id]);
    } else {
      const result = await db.query("INSERT INTO products(name,category,notes,price,stock,published,image) VALUES($1,'',$2,$3,$4,$5,$6) RETURNING id", [name, notes, price, stock, published, image]);
      productId = Number(result.rows[0].id);
    }
    for (const variant of variants ?? []) {
      const scent = await db.query("SELECT id FROM scents WHERE id=$1 FOR SHARE", [variant.scentId]);
      if (!scent.rowCount) throw new InputError("Аромат больше не существует", 409);
      const before = existing.find(v => Number(v.scent_id) === variant.scentId);
      if (before && variant.expectedStock === undefined) throw new InputError("Обновите карточку перед сохранением остатков", 409);
      if (before && variant.expectedStock !== before.stock) throw new InputError("Остаток варианта изменился после нового заказа. Откройте карточку заново.", 409);
      const variantImage = await upload(form.get(`variantImage:${variant.scentId}`)) ?? (variant.useMainImage ? image : before?.image ?? null);
      await db.query(`INSERT INTO product_variants(product_id,scent_id,stock,image,active) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(product_id,scent_id) DO UPDATE SET stock=EXCLUDED.stock,image=EXCLUDED.image,active=EXCLUDED.active,updated_at=NOW()`,
      [productId, variant.scentId, variant.stock, variantImage, variant.active]);
    }
    if (shape) await db.query("UPDATE products SET shape=$1 WHERE id=$2", [shape, productId]);
    if ((variants?.length ?? existing.length) > 0) {
      await db.query("UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=$1) WHERE id=$1", [productId]);
    } else {
      await db.query("UPDATE products SET stock=$1 WHERE id=$2", [stock, productId]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    await Promise.all(newImages.map(removeImage));
    throw error;
  } finally { db.release(); }
  return (await listProducts(true, productId))[0];
}
