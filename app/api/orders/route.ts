import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapOrder } from "@/lib/server/db";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM orders ORDER BY created_at DESC");
  return NextResponse.json(result.rows.map(mapOrder));
}

export async function POST(request:Request) {
  await ensureSchema();
  const body = await request.json();
  const ids = Array.isArray(body.items) ? body.items.map((item:{ productId:number }) => Number(item.productId)).filter(Number.isFinite) : [];
  if (!body.customerName || !body.phone || !body.email || !body.address || !ids.length) return NextResponse.json({ error:"Заполните контакты и состав заказа" }, { status:400 });
  const products = await getPool().query("SELECT id,name,price,published FROM products WHERE id = ANY($1::bigint[])", [ids]);
  const byId = new Map(products.rows.map((row) => [Number(row.id), row]));
  const items = body.items.map((item:{ productId:number; quantity:number }) => {
    const product = byId.get(Number(item.productId)); const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    if (!product?.published) return null;
    return { productId:Number(product.id), name:String(product.name), price:Number(product.price), quantity };
  }).filter(Boolean);
  if (!items.length) return NextResponse.json({ error:"Товары заказа больше недоступны" }, { status:400 });
  const total = items.reduce((sum:number, item:{price:number;quantity:number}) => sum + item.price * item.quantity, 0);
  const orderNumber = `T-${Date.now().toString().slice(-8)}`;
  const result = await getPool().query("INSERT INTO orders(order_number,customer_name,phone,email,address,delivery,comment,items,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *", [orderNumber,String(body.customerName),String(body.phone),String(body.email),String(body.address),String(body.delivery || "Уточнить"),String(body.comment || ""),JSON.stringify(items),total]);
  return NextResponse.json(mapOrder(result.rows[0]), { status:201 });
}
