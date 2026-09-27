import type { CandleForm } from "./catalog";

/** Filter artwork is a lit, textured miniature — never a tintable product mask. */
const portraits: Record<string, string> = {
  "змея": "snake", "тыква": "pumpkin", "кашпо": "pot", "лимон": "lemon",
};

const normalizedName = (name: string) => name.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");

/** Old prototype entries are hidden until the workshop actually stocks that form. */
export function isLegacyFormPlaceholder(form: Pick<CandleForm, "name">) {
  return ["чаша", "ребристое кашпо", "ребристая чаша", "ребристая чаша xs"].includes(normalizedName(form.name));
}

export function formPortrait(form: Pick<CandleForm, "name">) {
  const name = normalizedName(form.name);
  const small = /\s+xs$/.test(name);
  const key = portraits[name.replace(/\s+xs$/, "")];
  return key ? { src: `/assets/forms/portraits/${key}.webp`, small } : null;
}
