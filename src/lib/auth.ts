import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import { type SessionScope, getSession } from "./session";

export interface Me {
  id: string;
  name: string;
  role: "user" | "admin";
  login_id: string;
  phone: string | null;
  account_status: string;
  hasProfile: boolean;
  email: string | null;
  avatar_url: string | null;
}

export async function getMe(scope: SessionScope = "user"): Promise<Me | null> {
  const s = await getSession(scope);
  if (!s) return null;
  const { data } = await db()
    .from("users")
    .select("id,name,role,login_id,phone,account_status,email,avatar_url,profiles(user_id)")
    .eq("id", s.uid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const prof = (data as { profiles: unknown }).profiles;
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    login_id: data.login_id,
    phone: data.phone,
    account_status: data.account_status,
    hasProfile: Array.isArray(prof) ? prof.length > 0 : Boolean(prof),
    email: (data as { email?: string | null }).email ?? null,
    avatar_url: (data as { avatar_url?: string | null }).avatar_url ?? null,
  };
}

/**
 * 지금 보고 있던 화면 주소 (middleware가 x-pathname에 넣어 준다).
 * 우리 사이트 안의 경로만 받는다: '/'로 시작하고 '//'·'/\\'로 시작하지 않으며, 로그인·가입·온보딩 화면 자체는 빼서 되돌아가기가 돌지 않게 한다.
 */
/** 로그인 뒤 돌아갈 주소로 우리 사이트 안 경로만 받는다 ('//'·'/\\'로 시작하는 바깥 주소 차단) */
export function safeNext(p: string | null | undefined): string | null {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return null;
  return p;
}

async function currentPath(): Promise<string | null> {
  let p: string | null = null;
  try { p = (await headers()).get("x-pathname"); } catch { return null; }
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\") || p === "/") return null;
  if (/^\/(login|signup|onboarding|verify|logout)(\/|\?|$)/.test(p)) return null;
  return p;
}

const withNext = async (to: string) => {
  const p = await currentPath();
  return p ? `${to}?next=${encodeURIComponent(p)}` : to;
};

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(await withNext("/login"));
  return me;
}

export async function requireProfile(): Promise<Me> {
  const me = await requireMe();
  if (!me.hasProfile) redirect(await withNext("/onboarding"));
  return me;
}

// 운영자 권한 등급 (PRD 4장·16장 권한별 접근 통제)
// users.role은 'user'|'admin'만 받으므로 스키마를 바꾸지 않고 settings('admin.levels')에 운영자별 등급을 둔다.
// 적혀 있지 않은 운영자는 전체 권한. '조회 전용'은 화면은 다 보지만 아무것도 바꾸지 못한다.
export type AdminLevel = "full" | "viewer";
export type AdminMe = Me & { level: AdminLevel };
export const ADMIN_LEVEL_LABEL: Record<AdminLevel, string> = { full: "전체 권한", viewer: "조회 전용" };
export const ADMIN_OFF_MESSAGE = "꺼진 운영자 계정이에요. 다른 운영자에게 다시 켜 달라고 부탁해 주세요";
/** 화면·API에서 쓰는 운영자 확인: 운영자이고 꺼지지 않았을 때만 */
export const isActiveAdmin = (me: Pick<Me, "role" | "account_status"> | null): me is Me => Boolean(me && me.role === "admin" && me.account_status !== "banned");
export const VIEWER_DENIED ="조회 전용 계정이라 바꿀 수 없어요. 전체 권한 운영자에게 부탁해 주세요";

export async function adminLevels(): Promise<Record<string, AdminLevel>> {
  const { data } = await db().from("settings").select("value").eq("key", "admin.levels").maybeSingle();
  return (data?.value as Record<string, AdminLevel> | null) ?? {};
}

export async function adminLevelOf(userId: string): Promise<AdminLevel> {
  return (await adminLevels())[userId] === "viewer" ? "viewer" : "full";
}

export async function requireAdmin(): Promise<AdminMe> {
  const me = await getMe("admin");
  if (!me || me.role !== "admin") redirect("/admin/login");
  // 꺼진 운영자 계정(account_status=banned)은 로그인해 둔 세션이 남아 있어도 들어오지 못한다
  if (me.account_status === "banned") redirect(`/admin/login?e=${encodeURIComponent(ADMIN_OFF_MESSAGE)}`);
  return { ...me, level: await adminLevelOf(me.id) };
}

/**
 * 무언가를 바꾸는 서버 액션은 이걸로 막는다. 조회 전용이면 back 화면으로 돌려보내고 이유를 알린다.
 * back은 돌아갈 주소(쿼리 포함 가능). 버튼을 숨겨도 주소로 직접 보낼 수 있어서 서버에서 한 번 더 거른다.
 */
export async function requireAdminWrite(back = "/admin"): Promise<AdminMe> {
  const me = await requireAdmin();
  if (me.level === "viewer") {
    const [path, hash] = back.split("#");
    redirect(`${path}${path.includes("?") ? "&" : "?"}e=${encodeURIComponent(VIEWER_DENIED)}${hash ? `#${hash}` : ""}`);
  }
  return me;
}
