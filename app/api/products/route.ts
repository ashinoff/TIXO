import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapProduct } from "@/lib/server/db";
import { saveImage } from "@/lib/server/uploads";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const admin = await isAdmin();
  const result = await getPool().query(`SELECT id,name,category,notes,price,stock,published,image FROM products ${admin ? "" : "WHERE published = TRUE"} ORDER BY id`);
  return NextResponse.json(result.rows.map(mapProduct));
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema();
  const form = await request.formData();
  const file = form.get("image");
  let image: string | null = null;
  if (file instanceof File && file.size) image = await saveImage(file);
  const values = [String(form.get("name")||""),String(form.get("category")||""),String(form.get("notes")||""),Number(form.get("price")),Number(form.get("stock")),form.get("published") === "true",image];
  if (!values[0] || !values[1] || !values[2] || !Number.isFinite(values[3]) || !Number.isFinite(values[4])) return NextResponse.json({ error:"Заполните карточку товара" }, { status:400 });
  const result = await getPool().query("INSERT INTO products(name,category,notes,price,stock,published,image) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,category,notes,price,stock,published,image", values);
  return NextResponse.json(mapProduct(result.rows[0]), { status:201 });
}
