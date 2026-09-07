import { randomUUID } from "node:crypto";
import type { OrderItem } from "../catalog";
import { productShape, type CandleShape } from "../catalog";
import { ensureSchema, getPool, mapOrder } from "./db";
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
    const ids = [...new Set(order.items.map(item => item.productId))].sort((a, b) => a - b);
    // All writers lock products before variants, in ID order.
    const products = await db.query("SELECT * FROM products WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
    const variants = await db.query(`SELECT v.*, s.name AS scent_name, s.color, s.color_name, s.active AS scent_active
      FROM product_variants v JOIN scents s ON s.id=v.scent_id
      WHERE v.product_id=ANY($1::bigint[]) ORDER BY v.id FOR UPDATE OF v FOR SHARE OF s`, [ids]);
    const scents = await db.query("SELECT * FROM scents WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE", [[...new Set(order.items.flatMap(line => line.scentId ? [line.scentId] : []))]]);
    const items: OrderItem[] = [];
    for (const line of order.items) {
      const product = products.rows.find(p => Number(p.id) === line.productId);
      if (!product?.published) throw new InputError("Один из товаров больше недоступен. Обновите корзину.", 409);
      const choices = variants.rows.filter(v => Number(v.product_id) === line.productId);
      const variant = line.variantId === null ? null : choices.find(v => Number(v.id) === line.variantId);
      if ((choices.length && !variant) || (line.variantId !== null && !variant)) throw new InputError(`Выберите доступный аромат для «${product.name}»`, 409);
      if (variant && (!variant.active || !variant.scent_active || (line.scentId && Number(variant.scent_id) !== line.scentId))) throw new InputError(`Этот аромат «${product.name}» больше недоступен`, 409);
      const scent = variant ? { id: variant.scent_id, name: variant.scent_name, color: variant.color, color_name: variant.color_name } : scents.rows.find(s => Number(s.id) === line.scentId && s.active);
      if (!scent) throw new InputError(`Выберите доступный аромат для «${product.name}»`, 409);
      const stock = variant ? variant.stock : product.stock;
      if (line.quantity > stock) throw new InputError(`«${product.name}»: доступно ещё ${stock} шт. для этого заказа.`, 409);
      items.push({ productId: line.productId, variantId: variant ? Number(variant.id) : null, name: product.name,
        scentId: Number(scent.id), scentName: scent.name, color: scent.color, colorName: scent.color_name,
        shape: productShape({ id: Number(product.id), shape: product.shape as CandleShape | undefined }),
        image: variant?.image ?? product.image, price: product.price, quantity: line.quantity });
      if (variant) {
        await db.query("UPDATE product_variants SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [line.quantity, variant.id]);
        variant.stock -= line.quantity;
      } else {
        await db.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [line.quantity, product.id]);
        product.stock -= line.quantity;
      }
    }
    await db.query(`UPDATE products p SET stock=(SELECT SUM(stock) FROM product_variants WHERE product_id=p.id),updated_at=NOW()
      WHERE p.id=ANY($1::bigint[]) AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id)`, [ids]);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total > 2147483647) throw new InputError("Сумма заказа слишком велика");
    const orderNumber = `T-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const result = await db.query(`INSERT INTO orders(order_number,customer_name,phone,email,address,delivery,comment,items,total,stock_reserved,request_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,TRUE,$10) RETURNING *`,
    [orderNumber, order.customerName, order.phone, order.email, order.address, order.delivery, order.comment, JSON.stringify(items), total, order.requestKey]);
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
      const ids = [...new Set(order.items.map(item => item.productId))].sort((a, b) => a - b);
      await db.query("SELECT id FROM products WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
      await db.query("SELECT id FROM product_variants WHERE product_id=ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
      for (const item of order.items) {
        if (item.variantId) await db.query("UPDATE product_variants SET stock=stock+$1,updated_at=NOW() WHERE id=$2 AND product_id=$3", [item.quantity, item.variantId, item.productId]);
        else {
          // A legacy order cannot be restored into a guessed scent after conversion.
          const converted = await db.query("SELECT 1 FROM product_variants WHERE product_id=$1 LIMIT 1", [item.productId]);
          if (converted.rowCount) throw new InputError("В заказе исходный вариант, а товар уже разделён по ароматам. Сначала завершите заказ и скорректируйте нужный остаток вручную.", 409);
          await db.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [item.quantity, item.productId]);
        }
      }
      await db.query(`UPDATE products p SET stock=(SELECT SUM(stock) FROM product_variants WHERE product_id=p.id),updated_at=NOW()
        WHERE p.id=ANY($1::bigint[]) AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id)`, [ids]);
    }
    await db.query("DELETE FROM orders WHERE id=$1", [id]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
