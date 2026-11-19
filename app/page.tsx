import Storefront from "./storefront";
import { getStorefrontData } from "../lib/server/storefront";
import { organizationSchema, pageMetadata, serializeSchema, SITE_TITLE, SITE_DESCRIPTION } from "../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata("/", SITE_TITLE, SITE_DESCRIPTION);
export default async function Home() {
  const data = await getStorefrontData();
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(organizationSchema) }} /><Storefront initialData={data} /></>;
}
