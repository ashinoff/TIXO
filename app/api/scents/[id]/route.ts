import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapScent } from "@/lib/server/db";
import { integer, parseScent } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Аромат", 1);
    const scent = parseScent(await request.json());
    await ensureSchema();
    const result = await getPool().query(`UPDATE scents SET name=$1,description=$2,notes=$3,color=$4,color_name=$5,active=$6,updated_at=NOW()
      WHERE id=$7 RETURNING *`, [scent.name, scent.description, scent.notes, scent.color, scent.colorName, scent.active, id]);
    return result.rowCount ? NextResponse.json(mapScent(result.rows[0])) : NextResponse.json({ error: "Аромат не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Аромат", 1);
    await ensureSchema();
    const used = await getPool().query("SELECT 1 FROM product_variants WHERE scent_id=$1 LIMIT 1", [id]);
    if (used.rowCount) return NextResponse.json({ error: "Аромат связан с формами свечей. Отключите его, чтобы сохранить варианты и остатки." }, { status: 409 });
    const result = await getPool().query("DELETE FROM scents WHERE id=$1", [id]);
    return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Аромат не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
