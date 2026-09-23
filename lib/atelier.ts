/** Ingredient choices and backward-compatible order recipes. New shapes come from candle_forms. */
export const atelierShapes = { ribbed: "Рифлёная колонна", pillar: "Гладкая колонна", sphere: "Сфера" } as const;
export const atelierColors = { black: "Чёрный", ivory: "Слоновая кость", red: "Винный", rose: "Пудровый розовый" } as const;
export const atelierColorHex = { black: "#292827", ivory: "#e8ddca", red: "#6d2636", rose: "#b88789" } as const;
export const atelierTopNotes = { bergamot: "Бергамот", lemon: "Лимон", green: "Зелёные листья" } as const;
export const atelierHeartNotes = { honey: "Мёд", tea: "Белый чай", fig: "Инжир", thyme: "Тимьян" } as const;
export const atelierBaseNotes = { tonka: "Бобы тонка", oud: "Уд", amber: "Амбра" } as const;

export type RecipeIngredients = {
  color: keyof typeof atelierColors;
  top: keyof typeof atelierTopNotes;
  heart: keyof typeof atelierHeartNotes;
  base: keyof typeof atelierBaseNotes;
};
export type LegacyRecipe = RecipeIngredients & { shape: keyof typeof atelierShapes; formId?: never };
export type FormRecipe = RecipeIngredients & { formId: number; shape?: never };
export type Recipe = LegacyRecipe | FormRecipe;
export type CustomRecipe = Recipe;

export function copyRecipe(recipe: Recipe): Recipe {
  const ingredients = { color: recipe.color, top: recipe.top, heart: recipe.heart, base: recipe.base };
  return recipe.formId !== undefined ? { formId: recipe.formId, ...ingredients } : { shape: recipe.shape, ...ingredients };
}

export function recipeFormName(recipe: Recipe, formName?: string) {
  return recipe.formId !== undefined ? formName || `Форма № ${recipe.formId}` : atelierShapes[recipe.shape];
}

export function recipeKey(recipe: Recipe) {
  return `custom:${recipe.formId !== undefined ? `form-${recipe.formId}` : recipe.shape}:${recipe.color}:${recipe.top}:${recipe.heart}:${recipe.base}`;
}

export function recipeSummary(recipe: Recipe, formName?: string) {
  return `${recipeFormName(recipe, formName)} · ${atelierColors[recipe.color]} · ${atelierTopNotes[recipe.top]} / ${atelierHeartNotes[recipe.heart]} / ${atelierBaseNotes[recipe.base]}`;
}

/** Runtime guard also used to discard malformed persisted browser carts. */
export function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const recipe = value as Record<string, unknown>;
  const form = Object.hasOwn(recipe, "formId")
    ? typeof recipe.formId === "number" && Number.isSafeInteger(recipe.formId) && recipe.formId > 0 && !Object.hasOwn(recipe, "shape")
    : typeof recipe.shape === "string" && Object.hasOwn(atelierShapes, recipe.shape);
  return form && typeof recipe.color === "string" && Object.hasOwn(atelierColors, recipe.color)
    && typeof recipe.top === "string" && Object.hasOwn(atelierTopNotes, recipe.top)
    && typeof recipe.heart === "string" && Object.hasOwn(atelierHeartNotes, recipe.heart)
    && typeof recipe.base === "string" && Object.hasOwn(atelierBaseNotes, recipe.base);
}
