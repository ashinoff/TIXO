import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/server/uploads";
import { photoWidths } from "@/lib/photo-url";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
const types:Record<string,string>={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"};
const headers=(type:string)=>({"content-type":type,"cache-control":"public, max-age=31536000, immutable"});
// Smaller WebP copies are made once per width and kept next to the originals.
async function resized(safe:string, width:number) {
  const cached = path.join(uploadDir(), ".cache", `${path.parse(safe).name}-${width}.webp`);
  try { return await readFile(cached); } catch {}
  const { default: sharp } = await import("sharp");
  const file = await sharp(path.join(uploadDir(), safe)).rotate().resize({ width, withoutEnlargement:true }).webp({ quality:80 }).toBuffer();
  await mkdir(path.dirname(cached), { recursive:true }); await writeFile(cached, file);
  return file;
}
export async function GET(request:Request, context:{params:Promise<{name:string}>}) {
  const { name } = await context.params; const safe = path.basename(name); const ext = path.extname(safe).toLowerCase();
  if (!types[ext] || safe !== name) return new NextResponse("Not found", { status:404 });
  const width = Number(new URL(request.url).searchParams.get("w"));
  if (photoWidths.includes(width)) {
    try { return new NextResponse(new Uint8Array(await resized(safe, width)), { headers:headers("image/webp") }); }
    catch {} // the original below still answers, or reports the missing file
  }
  try { const file = await readFile(path.join(uploadDir(), safe)); return new NextResponse(file, { headers:headers(types[ext]) }); }
  catch { return new NextResponse("Not found", { status:404 }); }
}
