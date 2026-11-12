import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { getLegalContext } from "@/lib/server/legal";
import { apiError } from "@/lib/server/http";
import { legalKeys, type LegalSettings } from "@/lib/legal";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { settings, version } = await getLegalContext();
    return NextResponse.json({ settings, version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const body = await request.json();
    const settings = {} as LegalSettings;
    for (const key of Object.keys(legalKeys) as (keyof LegalSettings)[]) {
      const value = body?.[key];
      if (typeof value !== "string" || value.length > (key === "registrationDetails" ? 2000 : 600) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return NextResponse.json({ error: "Проверьте сведения владельца." }, { status: 400 });
      settings[key] = value.trim();
    }
    if (settings.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) return NextResponse.json({ error: "Проверьте адрес электронной почты." }, { status: 400 });
    if (settings.contactPhone && !/^\+?[\d ()-]{7,40}$/.test(settings.contactPhone)) return NextResponse.json({ error: "Проверьте телефон." }, { status: 400 });
    if (!settings.contactEmail && !settings.contactPhone) return NextResponse.json({ error: "Оставьте телефон или почту для обращений." }, { status: 400 });
    await ensureSchema();
    // One statement publishes the complete public contact block, including deliberate empty fields.
    await getPool().query(`INSERT INTO site_content(key,value,kind)
      SELECT key,value,'text' FROM unnest($1::text[],$2::text[]) AS setting(key,value)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,kind='text',updated_at=NOW()`,
    [Object.values(legalKeys), (Object.keys(legalKeys) as (keyof LegalSettings)[]).map(key => settings[key])]);
    const context = await getLegalContext();
    return NextResponse.json({ settings: context.settings, version: context.version });
  } catch (error) { return apiError(error); }
}
