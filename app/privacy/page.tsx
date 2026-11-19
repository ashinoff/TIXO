import { pageMetadata } from "../../lib/seo";
import { privacyDocument } from "../../lib/legal";
import { getLegalContext } from "../../lib/server/legal";
import { LegalDocumentPage } from "../components/legal-document";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata("/privacy", "Политика обработки персональных данных — ТИХО", "Как мастерская ТИХО обрабатывает и защищает данные при оформлении заказов.");
export default async function PrivacyPage() {
  const { settings, version } = await getLegalContext();
  return <LegalDocumentPage current="privacy" document={privacyDocument(settings)} settings={settings} version={version} />;
}
