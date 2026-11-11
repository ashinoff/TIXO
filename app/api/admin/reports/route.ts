import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getTradeReport, parsePeriod, saveExpense } from "@/lib/server/trade-reports";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers });
  try { return NextResponse.json(await getTradeReport(parsePeriod(new URL(request.url).searchParams)), { headers }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers });
  try { await saveExpense(await request.json()); return NextResponse.json({ ok: true }, { headers }); }
  catch (error) { return apiError(error); }
}
