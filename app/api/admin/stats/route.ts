import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getSiteStats } from "@/lib/server/site-stats";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers });
  try { return NextResponse.json(await getSiteStats(new URL(request.url).searchParams.get("days")), { headers }); }
  catch (error) { return apiError(error); }
}
