import { isAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ authenticated:await isAdmin() }); }
