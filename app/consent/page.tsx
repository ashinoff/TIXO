import { pageMetadata } from "../../lib/seo";
import { getLegalContext } from "../../lib/server/legal";
import { LegalDocumentPage } from "../components/legal-document";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata("/consent", "Согласие на обработку персональных данных — ТИХО", "Условия согласия на обработку персональных данных при заказе свечей в мастерской ТИХО.");
export default async function ConsentPage() {
  const { settings, version, document } = await getLegalContext();
  return <LegalDocumentPage current="consent" document={document} settings={settings} version={version} />;
}
