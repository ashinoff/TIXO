import type { Recipe } from "./atelier";

export type AromaProfile = Record<"top" | "heart" | "base", { notes: string; description: string }>;
export const emptyAromaProfile = (): AromaProfile => ({ top: { notes: "", description: "" }, heart: { notes: "", description: "" }, base: { notes: "", description: "" } });
export type CandleForm = { id: number; name: string; active: boolean; shape: CandleShape | null; silhouette?: string | null };

export type Scent = {
  id: number;
  name: string;
  description: string;
  notes: string[];
  profile?: AromaProfile;
  active: boolean;
};

export type CandleColor = { id: number; name: string; hex: string; active: boolean };

export const candleShapes = {
  twist: "Спираль", ribbed: "Колонна", bubble: "Бабл",
  arch: "Арка", shell: "Ракушка", knot: "Узел",
} as const;
export type CandleShape = keyof typeof candleShapes;
export function productShape(product: { id: number; shape?: CandleShape }) {
  return product.shape ?? (Object.keys(candleShapes) as CandleShape[])[Math.max(0, product.id - 1) % 6];
}

export type Variant = {
  id: number;
  scentId: number;
  colorId: number;
  color: CandleColor;
  stock: number;
  image: string | null;
  active: boolean;
  scent: Scent;
};

export type Product = {
  formId?: number | null;
  colorId?: number | null;
  scentId?: number | null;
  form?: CandleForm | null;
  color?: CandleColor | null;
  scent?: Scent | null;
  id: number;
  name: string;
  category: string;
  categoryId: number | null;
  categorySlug: string | null;
  notes: string;
  price: number;
  stock: number;
  published: boolean;
  image: string | null;
  hasVariants: boolean;
  variants: Variant[];
  shape?: CandleShape;
};

export type OrderItem = {
  formName?: string;
  silhouette?: string | null;
  productId: number;
  variantId?: number | null;
  scentId?: number | null;
  colorId?: number | null;
  shape?: CandleShape;
  name: string;
  scentName?: string;
  color?: string;
  colorName?: string;
  image?: string | null;
  price: number;
  quantity: number;
  /** Custom items have no catalog price yet; price contributes 0 to the known subtotal. */
  customRecipe?: Recipe;
  quotePending?: boolean;
};

export type CartLine = { productId: number; variantId: number | null; scentId?: number | null; colorId?: number | null; quantity: number };
export const cartKey = (productId: number, variantId: number | null, scentId?: number | null, colorId?: number | null) => `${productId}:${variantId ?? "original"}${scentId ? `:scent-${scentId}` : ""}${colorId ? `:color-${colorId}` : ""}`;
export const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export function availableVariants(product: Product) {
  return product.variants.filter(variant => variant.active && variant.scent.active && variant.color.active);
}

export function selectVariant(product: Product, scentId?: number | null, colorId?: number | null) {
  const variants = availableVariants(product).filter(v => colorId == null || v.colorId === colorId);
  if (scentId != null) return variants.find(variant => variant.scentId === scentId);
  return variants.find(variant => variant.stock > 0)
    ?? variants[0];
}
