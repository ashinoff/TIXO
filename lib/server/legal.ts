import { createHash } from "node:crypto";
import { ensureSchema, getPool } from "./db";
import { consentDocument, documentText, legalKeys, readLegalSettings } from "../legal";

export async function getLegalContext() {
  await ensureSchema();
  const result = await getPool().query("SELECT key,value FROM site_content WHERE key=ANY($1::text[])", [Object.values(legalKeys)]);
  const settings = readLegalSettings(Object.fromEntries(result.rows.map(row => [row.key, { value: row.value }])));
  const document = consentDocument(settings);
  const text = documentText(document);
  const version = createHash("sha256").update(text).digest("hex");
  return { settings, document, text, version };
}
