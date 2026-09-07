import { createSession } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return NextResponse.json({ error:"Вход не настроен: проверьте ADMIN_PASSWORD и SESSION_SECRET в настройках приложения Amvera." }, { status:503 });
  const { password } = await request.json();
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== "string" || password !== expected) return NextResponse.json({ error:"Неверный пароль" }, { status:401 });
  await createSession();
  return NextResponse.json({ ok:true });
  } catch (error) { return apiError(error); }
}
