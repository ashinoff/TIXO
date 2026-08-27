import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/server/uploads";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
const types:Record<string,string>={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"};
export async function GET(_request:Request, context:{params:Promise<{name:string}>}) {
  const { name } = await context.params; const safe = path.basename(name); const ext = path.extname(safe).toLowerCase();
  if (!types[ext] || safe !== name) return new NextResponse("Not found", { status:404 });
  try { const file = await readFile(path.join(uploadDir(), safe)); return new NextResponse(file, { headers:{"content-type":types[ext],"cache-control":"public, max-age=31536000, immutable"} }); }
  catch { return new NextResponse("Not found", { status:404 }); }
}
