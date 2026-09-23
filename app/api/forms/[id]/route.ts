import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapForm } from "@/lib/server/db";
import { integer, parseForm } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Форма", 1);
    const form = parseForm(await request.json());
    await ensureSchema();
    const result = await getPool().query(`UPDATE candle_forms SET name=$1,shape=$2,active=$3,updated_at=NOW()
      WHERE id=$4 RETURNING *`, [form.name, form.shape, form.active, id]);
    return result.rowCount ? NextResponse.json(mapForm(result.rows[0])) : NextResponse.json({ error: "Форма не найдена" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Форма", 1);
    await ensureSchema();
    const used = await getPool().query("SELECT 1 FROM products WHERE form_id=$1 LIMIT 1", [id]);
    if (used.rowCount) return NextResponse.json({ error: "Форма используется в свечах. Отключите её, чтобы сохранить свечи и остатки." }, { status: 409 });
    const result = await getPool().query("DELETE FROM candle_forms WHERE id=$1", [id]);
    return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Форма не найдена" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
