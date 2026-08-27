import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "tiho_admin";
const lifetime = 60 * 60 * 12;

function secret() { if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured"); return process.env.SESSION_SECRET; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }

export async function isAdmin() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function createSession() {
  const expires = String(Date.now() + lifetime * 1000);
  (await cookies()).set(COOKIE, `${expires}.${sign(expires)}`, { httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"strict", path:"/", maxAge:lifetime });
}

export async function clearSession() { (await cookies()).set(COOKIE, "", { httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"strict", path:"/", maxAge:0 }); }
