import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapProduct } from "@/lib/server/db";
import { removeImage, saveImage } from "@/lib/server/uploads";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id:string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema(); const { id } = await context.params; const form = await request.formData();
  const previous = await getPool().query("SELECT image FROM products WHERE id=$1", [id]);
  if (!previous.rowCount) return NextResponse.json({ error:"Товар не найден" }, { status:404 });
  let image = previous.rows[0].image as string | null; const file = form.get("image");
  if (file instanceof File && file.size) { const next = await saveImage(file); await removeImage(image); image = next; }
  const values = [String(form.get("name")||""),String(form.get("category")||""),String(form.get("notes")||""),Number(form.get("price")),Number(form.get("stock")),form.get("published") === "true",image,id];
  const result = await getPool().query("UPDATE products SET name=$1,category=$2,notes=$3,price=$4,stock=$5,published=$6,image=$7,updated_at=NOW() WHERE id=$8 RETURNING id,name,category,notes,price,stock,published,image", values);
  return NextResponse.json(mapProduct(result.rows[0]));
}

export async function DELETE(_request: Request, context: { params: Promise<{ id:string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema(); const { id } = await context.params;
  const result = await getPool().query("DELETE FROM products WHERE id=$1 RETURNING image", [id]);
  if (!result.rowCount) return NextResponse.json({ error:"Товар не найден" }, { status:404 });
  await removeImage(result.rows[0].image); return NextResponse.json({ ok:true });
}
