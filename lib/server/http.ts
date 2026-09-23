import { NextResponse } from "next/server";
import { InputError } from "./validation";

export function apiError(error: unknown) {
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
  const code = (error as { code?: string })?.code;
  if (code === "23505") return NextResponse.json({ error: "Такое название или цвет уже используется" }, { status: 409 });
  if (code === "23503" || code === "23001") return NextResponse.json({ error: "Запись используется в свечах. Отключите её в справочнике, чтобы сохранить остатки." }, { status: 409 });
  console.error("Store API failure", error instanceof Error ? error.name : "UnknownError", code ?? "");
  return NextResponse.json({ error: "Не удалось сохранить изменения. Попробуйте ещё раз." }, { status: 500 });
}
