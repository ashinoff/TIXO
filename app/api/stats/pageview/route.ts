import { NextResponse } from "next/server";
import { isSitePage } from "@/lib/site-stats";
import { countPageView } from "@/lib/server/site-stats";
import { InputError } from "@/lib/server/validation";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let originHost = "";
    try { if (origin) originHost = new URL(origin).host; } catch { /* Invalid origins are rejected below. */ }
    if (!originHost || originHost !== host || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new InputError("Запрос должен поступить с сайта", 403);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new InputError("Ожидается JSON", 415);
    // Limit the actual stream, not only the caller-controlled Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new InputError("Нет данных");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 128) { await reader.cancel(); throw new InputError("Слишком большой запрос", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || !isSitePage(body.path) || Object.keys(body).length !== 1) throw new InputError("Неизвестная страница");
    // UA is used transiently to skip common crawlers; it is never persisted/logged here.
    if (!/bot|crawler|spider|slurp|headless|preview|facebookexternalhit/i.test(request.headers.get("user-agent") ?? "")) {
      await countPageView(body.path);
    }
    return new NextResponse(null, { status: 204, headers });
  } catch (error) { return apiError(error); }
}
