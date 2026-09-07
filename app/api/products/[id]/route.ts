import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { saveProduct } from "@/lib/server/products";
import { integer } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try { return NextResponse.json(await saveProduct(await request.formData(), integer((await context.params).id, "Товар", 1))); }
  catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getPool().query("DELETE FROM products WHERE id=$1", [integer((await context.params).id, "Товар", 1)]);
    // Old order snapshots may reference these image files.
    return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
