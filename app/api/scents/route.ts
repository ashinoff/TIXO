import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool, mapScent } from "@/lib/server/db";
import { parseScent } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const admin = await isAdmin();
  const result = await getPool().query("SELECT * FROM scents WHERE $1::boolean OR active ORDER BY id", [admin]);
  return NextResponse.json(result.rows.map(mapScent));
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const scent = parseScent(await request.json());
    await ensureSchema();
    const result = await getPool().query(`INSERT INTO scents(name,description,notes,color,color_name,active)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [scent.name, scent.description, scent.notes, scent.color, scent.colorName, scent.active]);
    return NextResponse.json(mapScent(result.rows[0]), { status: 201 });
  } catch (error) { return apiError(error); }
}
