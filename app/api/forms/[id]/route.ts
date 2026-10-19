import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { integer } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
import { readFormRequest, saveForm } from "@/lib/server/forms";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Форма", 1);
    return NextResponse.json(await saveForm(await readFormRequest(request), id));
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const id = integer((await context.params).id, "Форма", 1);
  const db = await getPool().connect();
  try {
    await ensureSchema();
    await db.query("BEGIN");
    const found = await db.query("SELECT id FROM candle_forms WHERE id=$1 AND NOT archived FOR UPDATE", [id]);
    if (!found.rowCount) { await db.query("ROLLBACK"); return NextResponse.json({ error: "Форма не найдена" }, { status: 404 }); }
    // Keep orders and stock history safe: hiding a form also archives its attached live candles.
    const removed = await db.query("UPDATE products SET archived=TRUE,published=FALSE,updated_at=NOW() WHERE form_id=$1 AND NOT archived RETURNING id", [id]);
    await db.query("UPDATE candle_forms SET active=FALSE,archived=TRUE,updated_at=NOW() WHERE id=$1", [id]);
    await db.query("COMMIT");
    return NextResponse.json({ ok: true, archivedProducts: removed.rowCount });
  } catch (error) { await db.query("ROLLBACK"); return apiError(error); }
  finally { db.release(); }
}