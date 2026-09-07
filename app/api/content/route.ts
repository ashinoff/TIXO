import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { saveImage } from "@/lib/server/uploads";
import { apiError } from "@/lib/server/http";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  try {
  await ensureSchema(); const result = await getPool().query("SELECT key,value,kind FROM site_content ORDER BY key");
  return NextResponse.json(Object.fromEntries(result.rows.map((row) => [row.key,{ value:row.value, kind:row.kind }])));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request:Request) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  try {
  await ensureSchema(); const form = await request.formData(); const key = String(form.get("key") || ""); const kind = String(form.get("kind") || "text");
  if (!/^[a-z0-9_.-]+$/.test(key)) return NextResponse.json({ error:"Некорректный ключ" }, { status:400 });
  let value = String(form.get("value") || ""); const file = form.get("image");
  if (kind === "image" && file instanceof File && file.size) value = await saveImage(file);
  if (!value) return NextResponse.json({ error:"Добавьте содержимое" }, { status:400 });
  await getPool().query("INSERT INTO site_content(key,value,kind) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,kind=EXCLUDED.kind,updated_at=NOW()", [key,value,kind]);
  return NextResponse.json({ key,value,kind });
  } catch (error) { return apiError(error); }
}
