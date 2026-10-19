import { ensureSchema, getPool, mapForm } from "./db";
import { InputError, parseForm } from "./validation";
import { removeImage, saveImage } from "./uploads";

/** Name and silhouette are saved together; an unsuccessful edit leaves no orphan upload. */
export async function saveForm(input: FormData | Record<string, unknown>, id?: number) {
  const multipart = input instanceof FormData;
  const values = multipart ? { name: input.get("name"), active: input.get("active") === "true", ...(input.has("twoTone") ? { twoTone: input.get("twoTone") === "true" } : {}) } : input;
  const form = parseForm(values);
  const preset = multipart ? input.get("silhouettePreset") : null;
  if (preset && preset !== "snake-two-tone") throw new InputError("Неизвестный готовый силуэт");
  const file = multipart ? input.get("silhouette") : null;
  const filterFile = multipart ? input.get("filterImage") : null;
  if (file instanceof File && file.size && (!["image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) throw new InputError("Силуэт: PNG или WebP с прозрачным фоном, до 10 МБ");
  if (filterFile instanceof File && filterFile.size && (!["image/jpeg","image/png","image/webp"].includes(filterFile.type) || filterFile.size > 10 * 1024 * 1024)) throw new InputError("Миниатюра: JPG, PNG или WebP до 10 МБ");
  await ensureSchema();
  const db = await getPool().connect();
  let uploaded: string | null = null;
  let uploadedFilter: string | null = null;
  try {
    await db.query("BEGIN");
    const previous = id ? (await db.query("SELECT * FROM candle_forms WHERE id=$1 AND NOT archived FOR UPDATE", [id])).rows[0] : null;
    if (id && !previous) throw new InputError("Форма не найдена", 404);
    if (file instanceof File && file.size) uploaded = await saveImage(file);
    if (filterFile instanceof File && filterFile.size) uploadedFilter = await saveImage(filterFile);
    const remove = multipart && input.get("removeSilhouette") === "true";
    const silhouette = uploaded ?? (preset ? "/assets/forms/snake-two-tone.png" : null) ?? (remove ? null : previous?.silhouette ?? null);
    const removeFilter = multipart && input.get("removeFilterImage") === "true";
    const filterImage = uploadedFilter ?? (removeFilter ? null : previous?.filter_image ?? null);
    // Built-in geometry belongs only to existing forms and old API clients.
    const twoTone = form.twoTone ?? previous?.two_tone ?? false;
    if (twoTone && !silhouette) throw new InputError("Для двухцветной формы загрузите силуэт: чёрный корпус и белый декор на прозрачном фоне");
    if (previous?.two_tone && !twoTone && (await db.query("SELECT 1 FROM products WHERE form_id=$1 AND accent_color_id IS NOT NULL AND NOT archived LIMIT 1", [id])).rowCount) throw new InputError("У этой формы есть двухцветные свечи. Сначала измените их форму или уберите второй цвет.", 409);
    const shape = uploaded || preset || remove ? null : form.shape ?? previous?.shape ?? null;
    const result = id
      ? await db.query("UPDATE candle_forms SET name=$1,active=$2,silhouette=$3,shape=$4,two_tone=$5,filter_image=$6,updated_at=NOW() WHERE id=$7 AND NOT archived RETURNING *", [form.name, form.active, silhouette, shape, twoTone, filterImage, id])
      : await db.query("INSERT INTO candle_forms(name,active,silhouette,shape,two_tone,filter_image) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [form.name, form.active, silhouette, shape, twoTone, filterImage]);
    await db.query("COMMIT");
    // Keep replaced files: historical orders can still reference them.
    return mapForm(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK");
    if (uploaded) await removeImage(uploaded);
    if (uploadedFilter) await removeImage(uploadedFilter);
    throw error;
  } finally { db.release(); }
}

export async function readFormRequest(request: Request) {
  return request.headers.get("content-type")?.includes("multipart/form-data") ? request.formData() : request.json();
}
