import { createOrder } from "@/lib/server/orders";
import { apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapOrder } from "@/lib/server/db";
import { NextResponse } from "next/server";
import { orderMessage } from "@/lib/order-messaging";
import { consentChoice } from "@/lib/legal";
import { getLegalContext } from "@/lib/server/legal";
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
    const body = await request.json();
    const choice = consentChoice(body?.privacyConsent);
    if (!choice) return NextResponse.json({ error: "Подтвердите согласие на обработку персональных данных." }, { status: 400 });
    const legal = await getLegalContext();
    if (choice.version !== legal.version) return NextResponse.json({ error: "Текст согласия обновился. Прочитайте его и подтвердите ещё раз.", code: "CONSENT_UPDATED", version: legal.version }, { status: 409 });
    const order = await createOrder(body, { version: legal.version, acceptedAt: new Date().toISOString(), document: legal.text });
    return NextResponse.json({ orderNumber: order.orderNumber, total: order.total,
      quotePending: order.items.some(item => item.quotePending === true), message: orderMessage(order) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
