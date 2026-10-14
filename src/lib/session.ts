import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";

const COOKIE = "wt_session";

function secret(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET ??
    process.env.SUPABASE_JWT_SECRET ??
    // 별도 비밀값이 없으면 서버 전용 키에서 파생한다
    createHash("sha256").update(`wt:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev"}`).digest("hex");
  return new TextEncoder().encode(raw);
}

export interface Session {
  uid: string;
  role: "user" | "admin";
}

export async function setSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
