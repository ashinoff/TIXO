import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { loadTradeSource, parsePeriod } from "@/lib/server/trade-reports";
import { exportKinds, tradeWorkbook, type ExportKind } from "@/lib/server/trade-workbook";
import { InputError } from "@/lib/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Требуется вход" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const params = new URL(request.url).searchParams, kind = params.get("kind") ?? "all";
    if (!(exportKinds as readonly string[]).includes(kind)) throw new InputError("Неизвестный отчёт");
    const period = parsePeriod(params);
    const bytes = await tradeWorkbook(await loadTradeSource(), period, kind as ExportKind, { query: (params.get("q") ?? "").slice(0, 200), stock: params.get("stock") ?? "" });
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tixo-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return apiError(error); }
}
