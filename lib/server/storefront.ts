import { cache } from "react";
import { sortByName, type StorefrontData } from "../catalog";
import { ensureSchema, getPool, listProducts, mapColor, mapForm, mapScent } from "./db";

/** The same public visibility rules as the catalogue API; no admin records or orders. */
export const getStorefrontData = cache(async (): Promise<StorefrontData> => {
  await ensureSchema();
  const [products, scents, colors, forms, content] = await Promise.all([
    listProducts(),
    getPool().query("SELECT * FROM scents WHERE active ORDER BY id"),
    getPool().query("SELECT * FROM colors WHERE active ORDER BY id"),
    getPool().query("SELECT * FROM candle_forms WHERE active AND NOT archived ORDER BY id"),
    getPool().query("SELECT key,value,kind FROM site_content WHERE key LIKE 'atelier.%' ORDER BY key"),
  ]);
  return { products, scents: sortByName(scents.rows.map(mapScent)), colors: sortByName(colors.rows.map(mapColor)), forms: sortByName(forms.rows.map(mapForm)),
    content: Object.fromEntries(content.rows.map(row => [row.key, { value: row.value, kind: row.kind }])) };
});
