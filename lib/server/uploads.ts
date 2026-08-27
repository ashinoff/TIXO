import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const allowed = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);
export const uploadDir = () => process.env.UPLOAD_DIR || "/data/uploads";

export async function saveImage(file: File) {
  const extension = allowed.get(file.type);
  if (!extension) throw new Error("Допустимы только JPG, PNG и WebP");
  if (file.size > 10 * 1024 * 1024) throw new Error("Размер фотографии не должен превышать 10 МБ");
  await mkdir(uploadDir(), { recursive:true });
  const name = `${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDir(), name), Buffer.from(await file.arrayBuffer()));
  return `/api/uploads/${name}`;
}

export async function removeImage(url: string | null) {
  if (!url?.startsWith("/api/uploads/")) return;
  const name = path.basename(url);
  await unlink(path.join(uploadDir(), name)).catch(() => undefined);
}
