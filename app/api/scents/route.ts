import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapScent } from "@/lib/server/db";
import { saveScent } from "@/lib/server/scents";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("admin") === "1";
    if (admin && !await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    await ensureSchema();
    const result = await getPool().query("SELECT * FROM scents WHERE $1::boolean OR active ORDER BY id", [admin]);
    return NextResponse.json(result.rows.map(mapScent));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    return NextResponse.json(await saveScent(request), { status: 201 });
  } catch (error) { return apiError(error); }
}
