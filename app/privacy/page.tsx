import type { Metadata } from "next";
import { privacyDocument } from "../../lib/legal";
import { getLegalContext } from "../../lib/server/legal";
import { LegalDocumentPage } from "../components/legal-document";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Политика обработки персональных данных — ТИХО" };
export default async function PrivacyPage() {
  const { settings, version } = await getLegalContext();
  return <LegalDocumentPage current="privacy" document={privacyDocument(settings)} settings={settings} version={version} />;
}
