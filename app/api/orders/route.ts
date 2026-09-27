import { createOrder } from "@/lib/server/orders";
import { apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapOrder } from "@/lib/server/db";
import { NextResponse } from "next/server";
import { orderMessage } from "@/lib/order-messaging";
export const runtime = "nodejs";

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT * FROM orders ORDER BY created_at DESC");
    return NextResponse.json(result.rows.map(mapOrder));
  } catch (error) { return apiError(error); }
}

export async function POST(request:Request) {
  try {
    const order = await createOrder(await request.json());
    return NextResponse.json({ orderNumber: order.orderNumber, total: order.total,
      quotePending: order.items.some(item => item.quotePending === true), message: orderMessage(order) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
