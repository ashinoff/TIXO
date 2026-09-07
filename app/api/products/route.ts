import { isAdmin } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/db";
import { saveProduct } from "@/lib/server/products";
import { apiError } from "@/lib/server/http";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("admin") === "1";
    if (admin && !await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    return NextResponse.json(await listProducts(admin));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try { return NextResponse.json(await saveProduct(await request.formData()), { status: 201 }); }
  catch (error) { return apiError(error); }
}
