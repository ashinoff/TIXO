import { createOrder } from "@/lib/server/orders";
import { apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapOrder } from "@/lib/server/db";
import { NextResponse } from "next/server";
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
    return NextResponse.json({ orderNumber: order.orderNumber, total: order.total }, { status: 201 });
  } catch (error) { return apiError(error); }
}
