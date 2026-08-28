import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapOrder } from "@/lib/server/db";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function PATCH(request:Request, context:{params:Promise<{id:string}>}) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema(); const { id } = await context.params; const { status } = await request.json();
  if (!["new","in_progress","completed"].includes(status)) return NextResponse.json({ error:"Некорректный статус" }, { status:400 });
  const result = await getPool().query("UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *", [status,id]);
  if (!result.rowCount) return NextResponse.json({ error:"Заказ не найден" }, { status:404 });
  return NextResponse.json(mapOrder(result.rows[0]));
}

export async function DELETE(_request:Request, context:{params:Promise<{id:string}>}) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema(); const { id } = await context.params;
  const result = await getPool().query("DELETE FROM orders WHERE id=$1", [id]);
  return result.rowCount ? NextResponse.json({ ok:true }) : NextResponse.json({ error:"Заказ не найден" }, { status:404 });
}
