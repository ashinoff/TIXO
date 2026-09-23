import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapColor } from "@/lib/server/db";
import { integer, parseColor } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Цвет", 1);
    const color = parseColor(await request.json());
    await ensureSchema();
    const result = await getPool().query(`UPDATE colors SET name=$1,hex=$2,active=$3,updated_at=NOW()
      WHERE id=$4 RETURNING *`, [color.name, color.hex, color.active, id]);
    return result.rowCount ? NextResponse.json(mapColor(result.rows[0])) : NextResponse.json({ error: "Цвет не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Цвет", 1);
    await ensureSchema();
    const used = await getPool().query("SELECT 1 FROM products WHERE color_id=$1 UNION ALL SELECT 1 FROM product_variants WHERE color_id=$1 LIMIT 1", [id]);
    if (used.rowCount) return NextResponse.json({ error: "Цвет связан с вариантами свечей. Отключите его, чтобы сохранить свечи и остатки." }, { status: 409 });
    const result = await getPool().query("DELETE FROM colors WHERE id=$1", [id]);
    return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Цвет не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
