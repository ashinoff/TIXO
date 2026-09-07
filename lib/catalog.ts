export type Scent = {
  id: number;
  name: string;
  description: string;
  notes: string[];
  color: string;
  colorName: string;
  active: boolean;
};

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
};

export type OrderItem = {
  productId: number;
  variantId?: number | null;
  name: string;
  scentName?: string;
  color?: string;
  colorName?: string;
  image?: string | null;
  price: number;
  quantity: number;
};

export type CartLine = { productId: number; variantId: number | null; quantity: number };
export const cartKey = (productId: number, variantId: number | null) => `${productId}:${variantId ?? "original"}`;
export const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export function availableVariants(product: Product) {
  return product.variants.filter(variant => variant.active && variant.scent.active && variant.image);
}

export function selectVariant(product: Product, scentId?: number | null) {
  const variants = availableVariants(product);
  return variants.find(variant => variant.scentId === scentId)
    ?? variants.find(variant => variant.stock > 0)
    ?? variants[0];
}
