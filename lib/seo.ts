import type { Metadata } from "next";
import { availableVariants, productImages, type Product } from "./catalog";
import { photoUrl } from "./photo-url";

export const SITE_URL = "https://www.tixocandle.ru";
export const SITE_TITLE = "ТИХО — ароматические свечи ручной работы";
export const SITE_DESCRIPTION = "Ароматические свечи ТИХО: скульптурные формы из гипса, соевый воск и авторские ароматы. Выберите готовую свечу для своего вечера или в подарок.";
export const SITE_IMAGE = `${SITE_URL}/assets/hero-real-candle.webp`;

const letters: Record<string, string> = Object.fromEntries([
  ["а","a"],["б","b"],["в","v"],["г","g"],["д","d"],["е","e"],["ё","yo"],["ж","zh"],["з","z"],["и","i"],["й","y"],["к","k"],["л","l"],["м","m"],["н","n"],["о","o"],["п","p"],["р","r"],["с","s"],["т","t"],["у","u"],["ф","f"],["х","kh"],["ц","ts"],["ч","ch"],["ш","sh"],["щ","shch"],["ъ",""],["ы","y"],["ь",""],["э","e"],["ю","yu"],["я","ya"],
]);

export function productSlug(product: Product): string {
  const words = [product.name, product.color?.name, product.scent?.name].filter(Boolean).join(" ").toLowerCase();
  const slug = [...words].map(letter => letters[letter] ?? letter).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110).replace(/-$/, "");
  return `${slug || "svecha"}-${product.id}`;
}
export const productPath = (product: Product) => `/candles/${productSlug(product)}`;
export function productIdFromSlug(slug: string): number | null {
  const match = /^[a-z0-9]+(?:-[a-z0-9]+)*-([1-9]\d*)$/.exec(slug);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}
export function productTitle(product: Product): string {
  return [product.name, product.color?.name, product.scent?.name, product.volumeMl ? `${product.volumeMl} мл` : null].filter(Boolean).join(" · ");
}
export function productDescription(product: Product): string {
  return [`Свеча ${productTitle(product)} ручной работы.`, product.notes.trim(), "Мастерская ТИХО."].filter(Boolean).join(" ");
}
export function absoluteImage(image?: string | null): string {
  if (!image) return SITE_IMAGE;
  try {
    const url = new URL(photoUrl(image, 1600), SITE_URL);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : SITE_IMAGE;
  } catch { return SITE_IMAGE; }
}
export function pageMetadata(path: string, title: string, description: string, image = SITE_IMAGE): Metadata {
  return {
    title, description, alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { type: "website", locale: "ru_RU", siteName: "ТИХО", url: `${SITE_URL}${path}`, title, description, images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
export function productMetadata(product: Product): Metadata {
  return pageMetadata(productPath(product), `${productTitle(product)} — свеча ТИХО`, productDescription(product).slice(0, 200), absoluteImage(productImages(product)[0]));
}
export const organizationSchema = {
  "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "ТИХО", alternateName: "TIXO", url: SITE_URL,
};
export function productSchema(product: Product) {
  const stock = product.hasVariants ? availableVariants(product).reduce((sum, variant) => sum + variant.stock, 0) : product.stock;
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": `${SITE_URL}${productPath(product)}#product`,
    name: productTitle(product), description: productDescription(product), url: `${SITE_URL}${productPath(product)}`,
    sku: String(product.id), brand: { "@type": "Brand", name: "ТИХО" },
    ...(productImages(product).length ? { image: productImages(product).map(absoluteImage) } : {}),
    ...(product.color ? { color: product.color.name } : {}),
    offers: { "@type": "Offer", url: `${SITE_URL}${productPath(product)}`, priceCurrency: "RUB", price: product.price,
      availability: `https://schema.org/${stock > 0 ? "InStock" : "OutOfStock"}`, itemCondition: "https://schema.org/NewCondition", seller: { "@id": `${SITE_URL}/#organization`, "@type": "Organization", name: "ТИХО" } },
  };
}
/** Escaping '<' prevents authored catalogue text from closing a JSON-LD script. */
export const serializeSchema = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
