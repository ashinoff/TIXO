import { createSession } from "@/lib/server/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const { password } = await request.json();
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== "string" || password !== expected) return NextResponse.json({ error:"Неверный пароль" }, { status:401 });
  await createSession();
  return NextResponse.json({ ok:true });
}
