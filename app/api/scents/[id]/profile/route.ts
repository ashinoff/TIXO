import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapScent } from "@/lib/server/db";
import { integer, parseAromaProfile } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const id = integer((await context.params).id, "Аромат", 1);
    const profile = parseAromaProfile(await request.json());
    await ensureSchema();
    const result = await getPool().query("UPDATE scents SET profile=$1::jsonb,updated_at=NOW() WHERE id=$2 RETURNING *", [JSON.stringify(profile), id]);
    return result.rowCount ? NextResponse.json(mapScent(result.rows[0])) : NextResponse.json({ error: "Аромат не найден" }, { status: 404 });
  } catch (error) { return apiError(error); }
}
