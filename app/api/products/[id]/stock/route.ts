import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { updateStock } from "@/lib/server/products";
import { integer } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try { return NextResponse.json(await updateStock(integer((await context.params).id, "Свеча", 1), await request.json())); }
  catch (error) { return apiError(error); }
}
