import { isAdmin } from "@/lib/server/auth";
import { reorderProducts } from "@/lib/server/products";
import { apiError } from "@/lib/server/http";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try { return NextResponse.json(await reorderProducts(await request.json())); }
  catch (error) { return apiError(error); }
}
