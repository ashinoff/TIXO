import { ensureSchema, getPool, mapScent } from "./db";
import { InputError, parseScent } from "./validation";
import { saveImage, removeImage } from "./uploads";

export async function saveScent(request: Request, id?: number) {
  let raw: Record<string, unknown>;
  let file: File | undefined;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    try { raw = JSON.parse(String(form.get("data"))); } catch { throw new InputError("Проверьте данные аромата"); }
    const upload = form.get("image");
    if (upload instanceof File && upload.size) file = upload;
  } else raw = await request.json();
  const scent = parseScent(raw);
  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) throw new InputError("Фото: JPG, PNG или WebP, до 10 МБ");
  await ensureSchema();
  const db = await getPool().connect();
  let uploaded: string | null = null;
  try {
    await db.query("BEGIN");
    const old = id ? (await db.query("SELECT * FROM scents WHERE id=$1 FOR UPDATE", [id])).rows[0] : undefined;
    if (id && !old) throw new InputError("Аромат не найден", 404);
    if (file) uploaded = await saveImage(file);
    const image = uploaded ?? (scent.image !== undefined ? scent.image : old?.image ?? null);
    const values = [scent.name, scent.description, scent.notes, scent.active, JSON.stringify(scent.profile ?? old?.profile ?? {}), image];
    const result = id
      ? await db.query("UPDATE scents SET name=$1,description=$2,notes=$3,active=$4,profile=$5::jsonb,image=$6,updated_at=NOW() WHERE id=$7 RETURNING *", [...values, id])
      : await db.query("INSERT INTO scents(name,description,notes,active,profile,image) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *", values);
    await db.query("COMMIT");
    return mapScent(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK");
    if (uploaded) await removeImage(uploaded);
    throw error;
  } finally { db.release(); }
}
