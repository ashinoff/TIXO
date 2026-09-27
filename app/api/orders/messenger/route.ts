import { NextResponse } from "next/server";
import { ensureSchema, getPool } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";
import { messengerKeys } from "@/lib/order-messaging";
export const runtime = "nodejs";

/** Record a handoff, never claim that the external message was sent. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body?.requestKey !== "string" || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.requestKey) || typeof body.channel !== "string" || !Object.hasOwn(messengerKeys, body.channel)) {
      return NextResponse.json({ error: "Некорректные данные перехода." }, { status: 400 });
    }
    await ensureSchema();
    // The random checkout key is required; public order numbers cannot change this field.
    // One atomic append preserves concurrent clicks and makes retries idempotent.
    await getPool().query(`UPDATE orders SET messenger_channels=array_append(messenger_channels,$2)
      WHERE request_key=$1 AND NOT ($2=ANY(messenger_channels))`, [body.requestKey, body.channel]);
    // An unknown key gives the same response and never exposes order data.
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
