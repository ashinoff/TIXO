import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapForm } from "@/lib/server/db";
import { parseForm } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("admin") === "1";
    if (admin && !await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    await ensureSchema();
    const result = await getPool().query("SELECT * FROM candle_forms WHERE $1::boolean OR active ORDER BY id", [admin]);
    return NextResponse.json(result.rows.map(mapForm));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const form = parseForm(await request.json());
    await ensureSchema();
    const result = await getPool().query(`INSERT INTO candle_forms(name,shape,active)
      VALUES($1,$2,$3) RETURNING *`, [form.name, form.shape, form.active]);
    return NextResponse.json(mapForm(result.rows[0]), { status: 201 });
  } catch (error) { return apiError(error); }
}
