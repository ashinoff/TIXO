import type { MetadataRoute } from "next";
import { listProducts } from "../lib/server/db";
import { productPath, SITE_URL } from "../lib/seo";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listProducts();
  return ["/", "/privacy", "/consent", ...products.map(productPath)].map(path => ({ url: `${SITE_URL}${path}` }));
}
