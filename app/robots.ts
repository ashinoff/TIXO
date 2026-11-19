import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Keep /admin crawlable so its noindex can be read. Authentication protects its data.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/admin/", "/api/orders"] }, sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
