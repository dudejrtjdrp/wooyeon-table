import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash } from "crypto";

// 참가자와 운영자 세션을 따로 둔다: 심사위원이 한 브라우저에서 운영자 화면과 참가자 앱을 나란히 열어도 서로 로그아웃되지 않게
const COOKIE = "wt_session";
const ADMIN_COOKIE = "wt_admin";
export type SessionScope = "user" | "admin";

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
  (await cookies()).set(s.role === "admin" ? ADMIN_COOKIE : COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

async function read(name: string): Promise<Session | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

/**
 * scope 'user'(기본): 참가자 세션, 없으면 운영자 세션.
 * scope 'admin': 운영자 세션, 없으면 (예전에 만든) 참가자 쿠키에 든 운영자 세션.
 */
export async function getSession(scope: SessionScope = "user"): Promise<Session | null> {
  if (scope === "admin") {
    const a = await read(ADMIN_COOKIE);
    if (a) return a;
    const u = await read(COOKIE);
    return u?.role === "admin" ? u : null;
  }
  return (await read(COOKIE)) ?? (await read(ADMIN_COOKIE));
}

/** scope를 주면 그쪽만, 없으면 둘 다 지운다 */
export async function clearSession(scope?: SessionScope) {
  const c = await cookies();
  if (scope !== "admin") c.delete(COOKIE);
  if (scope !== "user") c.delete(ADMIN_COOKIE);
}
