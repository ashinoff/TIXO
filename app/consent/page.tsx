import type { Metadata } from "next";
import { getLegalContext } from "../../lib/server/legal";
import { LegalDocumentPage } from "../components/legal-document";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Согласие на обработку персональных данных — ТИХО" };
export default async function ConsentPage() {
  const { settings, version, document } = await getLegalContext();
  return <LegalDocumentPage current="consent" document={document} settings={settings} version={version} />;
}
