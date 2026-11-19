import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "./lib/seo";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? request.nextUrl.host).split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  if (host === "tixocandle.ru" && ["GET", "HEAD"].includes(request.method) && !path.startsWith("/api/") && !path.startsWith("/admin")) {
    return NextResponse.redirect(new URL(`${path}${request.nextUrl.search}`, SITE_URL), 301);
  }
  const response = NextResponse.next();
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|assets/|favicon.ico|favicon.svg).*)"] };
