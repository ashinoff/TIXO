import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";
import { messengerKeys, normalizeMessengerContact, readMessengerContacts, type Messenger } from "@/lib/order-messaging";
export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT key,value FROM site_content WHERE key=ANY($1::text[])", [Object.values(messengerKeys)]);
    return NextResponse.json(readMessengerContacts(Object.fromEntries(result.rows.map(row => [row.key, { value: row.value }]))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const body = await request.json();
    let contacts;
    try {
      contacts = Object.fromEntries((Object.keys(messengerKeys) as Messenger[]).map(kind => [kind, normalizeMessengerContact(kind, body?.[kind])]));
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Проверьте контакты." }, { status: 400 }); }
    await ensureSchema();
    // Save the two active settings atomically. Empty strings deliberately hide a channel.
    await getPool().query(`INSERT INTO site_content(key,value,kind)
      SELECT key,value,'text' FROM unnest($1::text[],$2::text[]) AS setting(key,value)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,kind='text',updated_at=NOW()`,
    [Object.values(messengerKeys), (Object.keys(messengerKeys) as Messenger[]).map(kind => contacts[kind])]);
    return NextResponse.json(contacts);
  } catch (error) { return apiError(error); }
}
