import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapProduct } from "@/lib/server/db";
import { saveImage } from "@/lib/server/uploads";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const admin = await isAdmin();
  const result = await getPool().query(`SELECT p.id,p.name,p.category,p.notes,p.price,p.stock,p.published,p.image,p.category_id,c.name AS category_name,c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id ${admin ? "" : "WHERE p.published = TRUE"} ORDER BY p.id`);
  return NextResponse.json(result.rows.map(mapProduct));
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error:"Требуется вход" }, { status:401 });
  await ensureSchema();
  const form = await request.formData();
  const file = form.get("image");
  let image: string | null = null;
  if (file instanceof File && file.size) image = await saveImage(file);
  const categoryId=Number(form.get("categoryId"));
  const category=await getPool().query("SELECT name FROM categories WHERE id=$1",[categoryId]);
  const values = [String(form.get("name")||""),String(category.rows[0]?.name||""),String(form.get("notes")||""),Number(form.get("price")),Number(form.get("stock")),form.get("published") === "true",image,categoryId];
  if (!values[0] || !values[1] || !values[2] || !Number.isFinite(values[3]) || !Number.isFinite(values[4])) return NextResponse.json({ error:"Заполните карточку товара" }, { status:400 });
  const result = await getPool().query("INSERT INTO products(name,category,notes,price,stock,published,image,category_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,category,notes,price,stock,published,image,category_id", values);
  return NextResponse.json(mapProduct(result.rows[0]), { status:201 });
}
