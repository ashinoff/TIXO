/** Canonical choices shared by the workshop, checkout and order snapshots. */
export const atelierShapes = { ribbed: "Рифлёная колонна", pillar: "Гладкая колонна", sphere: "Сфера" } as const;
export const atelierColors = { black: "Чёрный", ivory: "Слоновая кость", red: "Винный", rose: "Пудровый розовый" } as const;
export const atelierColorHex = { black: "#292827", ivory: "#e8ddca", red: "#6d2636", rose: "#b88789" } as const;
export const atelierTopNotes = { bergamot: "Бергамот", lemon: "Лимон", green: "Зелёные листья" } as const;
export const atelierHeartNotes = { honey: "Мёд", tea: "Белый чай", fig: "Инжир", thyme: "Тимьян" } as const;
export const atelierBaseNotes = { tonka: "Бобы тонка", oud: "Уд", amber: "Амбра" } as const;

export type Recipe = {
  shape: keyof typeof atelierShapes;
  color: keyof typeof atelierColors;
  top: keyof typeof atelierTopNotes;
  heart: keyof typeof atelierHeartNotes;
  base: keyof typeof atelierBaseNotes;
};
export type CustomRecipe = Recipe;

export function recipeKey(recipe: Recipe) {
  return `custom:${recipe.shape}:${recipe.color}:${recipe.top}:${recipe.heart}:${recipe.base}`;
}

export function recipeSummary(recipe: Recipe) {
  return `${atelierShapes[recipe.shape]} · ${atelierColors[recipe.color]} · ${atelierTopNotes[recipe.top]} / ${atelierHeartNotes[recipe.heart]} / ${atelierBaseNotes[recipe.base]}`;
}

/** Runtime guard also used to discard malformed persisted browser carts. */
export function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const recipe = value as Record<string, unknown>;
  return typeof recipe.shape === "string" && Object.hasOwn(atelierShapes, recipe.shape)
    && typeof recipe.color === "string" && Object.hasOwn(atelierColors, recipe.color)
    && typeof recipe.top === "string" && Object.hasOwn(atelierTopNotes, recipe.top)
    && typeof recipe.heart === "string" && Object.hasOwn(atelierHeartNotes, recipe.heart)
    && typeof recipe.base === "string" && Object.hasOwn(atelierBaseNotes, recipe.base);
}
