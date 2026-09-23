import { ensureSchema, getPool, mapForm } from "./db";
import { InputError, parseForm } from "./validation";
import { removeImage, saveImage } from "./uploads";

/** Name and silhouette are saved together; an unsuccessful edit leaves no orphan upload. */
export async function saveForm(input: FormData | Record<string, unknown>, id?: number) {
  const multipart = input instanceof FormData;
  const values = multipart ? { name: input.get("name"), active: input.get("active") === "true" } : input;
  const form = parseForm(values);
  const file = multipart ? input.get("silhouette") : null;
  if (file instanceof File && file.size && (!["image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) throw new InputError("Силуэт: PNG или WebP с прозрачным фоном, до 10 МБ");
  await ensureSchema();
  const db = await getPool().connect();
  let uploaded: string | null = null;
  try {
    await db.query("BEGIN");
    const previous = id ? (await db.query("SELECT * FROM candle_forms WHERE id=$1 FOR UPDATE", [id])).rows[0] : null;
    if (id && !previous) throw new InputError("Форма не найдена", 404);
    if (file instanceof File && file.size) uploaded = await saveImage(file);
    const remove = multipart && input.get("removeSilhouette") === "true";
    const silhouette = uploaded ?? (remove ? null : previous?.silhouette ?? null);
    // Built-in geometry belongs only to existing forms and old API clients.
    const shape = uploaded || remove ? null : form.shape ?? previous?.shape ?? null;
    const result = id
      ? await db.query("UPDATE candle_forms SET name=$1,active=$2,silhouette=$3,shape=$4,updated_at=NOW() WHERE id=$5 RETURNING *", [form.name, form.active, silhouette, shape, id])
      : await db.query("INSERT INTO candle_forms(name,active,silhouette,shape) VALUES($1,$2,$3,$4) RETURNING *", [form.name, form.active, silhouette, shape]);
    await db.query("COMMIT");
    // Keep replaced files: historical orders can still reference them.
    return mapForm(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK");
    if (uploaded) await removeImage(uploaded);
    throw error;
  } finally { db.release(); }
}

export async function readFormRequest(request: Request) {
  return request.headers.get("content-type")?.includes("multipart/form-data") ? request.formData() : request.json();
}
