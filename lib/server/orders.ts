import { randomUUID } from "node:crypto";
import type { OrderItem } from "../catalog";
import { productShape, type CandleShape } from "../catalog";
import { recipeFormName, atelierColors, atelierColorHex, atelierTopNotes, atelierHeartNotes, atelierBaseNotes } from "../atelier";
import { ensureSchema, getPool, mapOrder, mapScent } from "./db";
import { InputError, parseOrder } from "./validation";

export async function createOrder(body: Record<string, unknown>) {
  const order = parseOrder(body);
  await ensureSchema();
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    if (order.requestKey) {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [order.requestKey]);
      const prior = await db.query("SELECT * FROM orders WHERE request_key=$1", [order.requestKey]);
      if (prior.rowCount) { await db.query("COMMIT"); return mapOrder(prior.rows[0]); }
    }
    const ids = [...new Set(order.items.flatMap(item => item.customRecipe ? [] : [item.productId]))].sort((a, b) => a - b);
    const products = await db.query("SELECT * FROM products WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
    const formIds = [...new Set([...products.rows.map(p => Number(p.form_id)).filter(Boolean), ...order.items.flatMap(line => line.customRecipe?.formId ? [line.customRecipe.formId] : [])])].sort((a,b) => a-b);
    const forms = await db.query("SELECT * FROM candle_forms WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE", [formIds]);
    const scents = await db.query("SELECT * FROM scents WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE", [[...new Set(order.items.flatMap(line => { const id = line.customRecipe?.scentId ?? line.scentId; return id ? [id] : []; }))].sort((a,b) => a-b)]);
    const colors = await db.query("SELECT * FROM colors WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE", [[...new Set(order.items.flatMap(line => [line.customRecipe?.colorId ?? line.colorId, line.customRecipe?.accentColorId ?? line.accentColorId]).filter((id): id is number => id !== undefined))].sort((a,b) => a-b)]);
    const items: OrderItem[] = [];
    for (const line of order.items) {
      if (line.customRecipe) {
        const recipe = line.customRecipe;
        const customForm = recipe.formId !== undefined ? forms.rows.find(form => Number(form.id) === recipe.formId) : undefined;
        if (recipe.formId !== undefined && !customForm?.active) throw new InputError("Выбранная форма авторской свечи больше недоступна. Выберите другую форму в мастерской.", 409);
        const formName = recipeFormName(recipe, customForm?.name);
        const customScent = recipe.scentId !== undefined ? scents.rows.find(scent => Number(scent.id) === recipe.scentId) : undefined;
        if (recipe.scentId !== undefined && !customScent?.active) throw new InputError("Выбранный аромат авторской свечи больше недоступен. Выберите другой аромат в мастерской.", 409);
        const customColor = recipe.colorId !== undefined ? colors.rows.find(color => Number(color.id) === recipe.colorId && color.active) : undefined;
        const accentColor = recipe.accentColorId !== undefined ? colors.rows.find(color => Number(color.id) === recipe.accentColorId && color.active) : undefined;
        if ((recipe.colorId !== undefined && !customColor) || (recipe.accentColorId !== undefined && !accentColor)) throw new InputError("Выбранный цвет больше недоступен. Выберите цвет заново в мастерской.", 409);
        if (Boolean(customForm?.two_tone) !== Boolean(recipe.accentColorId)) throw new InputError("Настройки цветов этой формы изменились. Соберите свечу заново в мастерской.", 409);
        items.push({ productId: 0, name: `Авторская свеча · ${formName}`,
          ...(customForm ? { formName, twoTone: Boolean(customForm.two_tone), silhouette: customForm.silhouette ?? null, shape: customForm.shape ?? undefined } : {}),
          ...(recipe.scentId !== undefined ? { scentId: recipe.scentId, scentName: customScent!.name, aromaProfile: mapScent(customScent!).profile }
            : { scentName: `${atelierTopNotes[recipe.top]} / ${atelierHeartNotes[recipe.heart]} / ${atelierBaseNotes[recipe.base]}` }),
          colorId: recipe.colorId, color: customColor?.hex ?? atelierColorHex[recipe.color], colorName: customColor?.name ?? atelierColors[recipe.color],
          ...(accentColor ? { accentColorId: Number(accentColor.id), accentColor: accentColor.hex, accentColorName: accentColor.name } : {}),
          price: 0, quantity: line.quantity, customRecipe: recipe, quotePending: true });
        continue;
      }
      const product = products.rows.find(p => Number(p.id) === line.productId);
      const form = forms.rows.find(f => Number(f.id) === Number(product?.form_id));
      if (!product?.published || product.archived || form?.active === false) throw new InputError("Один из товаров больше недоступен. Обновите корзину.", 409);
      if (line.variantId !== null || (product.scent_id && Number(product.scent_id) !== line.scentId) || (product.color_id && Number(product.color_id) !== line.colorId) || (product.accent_color_id ? Number(product.accent_color_id) : null) !== (line.accentColorId ?? null)) throw new InputError(`Сочетание для «${form?.name || product.name}» изменилось. Выберите свечу заново.`, 409);
      const scent = scents.rows.find(s => Number(s.id) === line.scentId && s.active);
      if (!scent) throw new InputError(`Выберите доступный аромат для «${product.name}»`, 409);
      const color = colors.rows.find(c => Number(c.id) === line.colorId && c.active);
      if (!color) throw new InputError(`Выберите доступный цвет для «${product.name}»`, 409);
      const accentColor = line.accentColorId ? colors.rows.find(c => Number(c.id) === line.accentColorId && c.active) : undefined;
      if (line.accentColorId && !accentColor) throw new InputError("Цвет декора больше недоступен. Обновите корзину.", 409);
      const stock = product.stock;
      if (line.quantity > stock) throw new InputError(`«${product.name}»: доступно ещё ${stock} шт. для этого заказа.`, 409);
      items.push({ productId: line.productId, variantId: null, name: form?.name || product.name,
        scentId: Number(scent.id), scentName: scent.name, colorId: Number(color.id), color: color.hex, colorName: color.name,
        shape: form ? form.shape ?? undefined : productShape({ id: Number(product.id), shape: product.shape as CandleShape | undefined }),
        twoTone: Boolean(form?.two_tone), ...(accentColor ? { accentColorId: Number(accentColor.id), accentColor: accentColor.hex, accentColorName: accentColor.name } : {}),
        silhouette: form?.silhouette ?? null, image: product.image, price: product.price, quantity: line.quantity });
      await db.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [line.quantity, product.id]);
      product.stock -= line.quantity;
    }
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total > 2147483647) throw new InputError("Сумма заказа слишком велика");
    const orderNumber = `T-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const result = await db.query(`INSERT INTO orders(order_number,customer_name,phone,email,address,delivery,comment,items,total,stock_reserved,request_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING *`,
    [orderNumber, order.customerName, order.phone, order.email, order.address, order.delivery, order.comment, JSON.stringify(items), total, ids.length > 0, order.requestKey]);
    await db.query("COMMIT");
    return mapOrder(result.rows[0]);
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

export async function deleteOrder(id: number) {
  await ensureSchema();
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const result = await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id]);
    if (!result.rowCount) throw new InputError("Заказ не найден", 404);
    const order = mapOrder(result.rows[0]);
    if (order.stockReserved && order.status !== "completed") {
      const catalogItems = order.items.filter(item => !item.customRecipe);
      const legacy = await db.query("SELECT id,legacy_variant_id,legacy_parent_id FROM products WHERE legacy_variant_id=ANY($1::bigint[])", [catalogItems.map(item => item.variantId).filter(Boolean)]);
      const targets = catalogItems.map(item => {
        if (!item.variantId) return { item, id: item.productId };
        const mapped = legacy.rows.find(p => Number(p.legacy_variant_id) === item.variantId && Number(p.legacy_parent_id) === item.productId);
        if (!mapped) throw new InputError("Не удалось найти свечу из старого заказа. Проверьте остаток вручную перед завершением заказа.", 409);
        return { item, id: Number(mapped.id) };
      });
      const ids = [...new Set(targets.map(target => target.id))].sort((a, b) => a - b);
      const rows = await db.query("SELECT * FROM products WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
      for (const { item, id: targetId } of targets) {
        const product = rows.rows.find(p => Number(p.id) === targetId);
        if (!product) throw new InputError("Свеча из заказа удалена. Проверьте остаток вручную перед завершением заказа.", 409);
        if (!item.variantId && (await db.query("SELECT 1 FROM product_variants WHERE product_id=$1 LIMIT 1", [targetId])).rowCount) throw new InputError("В старом заказе общий остаток, а свечи уже разделены. Проверьте количество вручную перед завершением заказа.", 409);
        if (!item.variantId && ((product.color_id && Number(product.color_id) !== item.colorId) || (product.scent_id && Number(product.scent_id) !== item.scentId) || (product.accent_color_id ? Number(product.accent_color_id) : null) !== (item.accentColorId ?? null))) throw new InputError("Сочетание свечи изменилось. Проверьте остаток вручную перед завершением заказа.", 409);
        await db.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [item.quantity, targetId]);
      }
    }
    await db.query("DELETE FROM orders WHERE id=$1", [id]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
