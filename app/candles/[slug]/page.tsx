import { notFound, permanentRedirect } from "next/navigation";
import { getStorefrontData } from "../../../lib/server/storefront";
import { productIdFromSlug, productMetadata, productPath, productSchema, productSlug, serializeSchema } from "../../../lib/seo";
import { ProductPage } from "../../components/product-page";
import "../../storefront.css";
import "../../components/commerce.css";
import "../../components/product-page.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
async function findProduct(params: Props["params"]) {
  const { slug } = await params;
  const id = productIdFromSlug(slug);
  if (id === null) notFound();
  const data = await getStorefrontData();
  const product = data.products.find(item => item.id === id);
  if (!product) notFound();
  // Renaming a form, colour or scent never breaks an already shared product ID.
  if (slug !== productSlug(product)) permanentRedirect(productPath(product));
  return { product, data };
}
export async function generateMetadata({ params }: Props) {
  return productMetadata((await findProduct(params)).product);
}
export default async function CandlePage({ params }: Props) {
  const { product, data } = await findProduct(params);
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(productSchema(product)) }} /><ProductPage product={product} data={data} /></>;
}
