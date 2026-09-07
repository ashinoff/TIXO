export type Scent = {
  id: number;
  name: string;
  description: string;
  notes: string[];
  color: string;
  colorName: string;
  active: boolean;
};

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
  stock: number;
  image: string | null;
  active: boolean;
  scent: Scent;
};

export type Product = {
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
  productId: number;
  variantId?: number | null;
  scentId?: number | null;
  shape?: CandleShape;
  name: string;
  scentName?: string;
  color?: string;
  colorName?: string;
  image?: string | null;
  price: number;
  quantity: number;
};

export type CartLine = { productId: number; variantId: number | null; scentId?: number | null; quantity: number };
export const cartKey = (productId: number, variantId: number | null, scentId?: number | null) => `${productId}:${variantId ?? "original"}${scentId ? `:scent-${scentId}` : ""}`;
export const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export function availableVariants(product: Product) {
  return product.variants.filter(variant => variant.active && variant.scent.active);
}

export function selectVariant(product: Product, scentId?: number | null) {
  const variants = availableVariants(product);
  if (scentId != null) return variants.find(variant => variant.scentId === scentId);
  return variants.find(variant => variant.stock > 0)
    ?? variants[0];
}
