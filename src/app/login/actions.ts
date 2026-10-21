"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { ADMIN_OFF_MESSAGE, safeNext } from "@/lib/auth";
import { normalizeLoginId } from "@/lib/login-id";
import { idvEnabled } from "@/lib/identity";
import { db } from "@/lib/supabase";
import { clearSession, setSession } from "@/lib/session";

const normalize = normalizeLoginId;

export async function login(form: FormData) {
  const id = normalize(String(form.get("login_id") ?? ""));
  const pw = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const nq = safeNext(next) && next !== "/" ? `&next=${encodeURIComponent(next)}` : "";
  if (!id || !pw) redirect(`/login/phone?e=${encodeURIComponent("휴대폰 번호와 비밀번호를 입력해 주세요")}${nq}`);

  const { data: user } = await db()
    .from("users")
    .select("id,role,password_hash,account_status")
    .eq("login_id", id)
    .maybeSingle();
  if (!user || !user.password_hash || !(await bcrypt.compare(pw, user.password_hash))) {
    redirect(`/login/phone?e=${encodeURIComponent("휴대폰 번호나 비밀번호가 맞지 않아요. 다시 확인해 주세요")}${nq}`);
  }
  if (user.account_status === "banned" && user.role === "admin") redirect(`/admin/login?e=${encodeURIComponent(ADMIN_OFF_MESSAGE)}`);
  if (user.account_status === "banned") {
    redirect(`/login/phone?e=${encodeURIComponent("이용이 제한된 계정이에요. help@wooyeon-table.app으로 문의해 주세요")}`);
  }
  await setSession({ uid: user.id, role: user.role });
  redirect(user.role === "admin" ? "/admin" : safeNext(next) ?? "/");
}

export async function signup(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const phone = normalize(String(form.get("phone") ?? ""));
  const pw = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "");
  const next = safeNext(nextRaw) ?? "";
  const nq = next ? `&next=${encodeURIComponent(next)}` : "";
  const back = (m: string) => redirect(`/signup?e=${encodeURIComponent(m)}${nq}`);

  if (name.length < 2) back("이름을 두 글자 이상 적어 주세요");
  if (!/^01\d{8,9}$/.test(phone)) back("휴대폰 번호를 다시 확인해 주세요");
  if (pw.length < 6) back("비밀번호는 6자 이상으로 정해 주세요");

  const { data: exists } = await db().from("users").select("id").eq("login_id", phone).maybeSingle();
  if (exists) back("이미 가입된 번호예요. 로그인해 주세요");

  const { data: user, error } = await db()
    .from("users")
    .insert({ login_id: phone, phone, name, password_hash: await bcrypt.hash(pw, 10) })
    .select("id,role")
    .single();
  if (error || !user) back("가입 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요");
  await setSession({ uid: user!.id, role: user!.role });
  // 가입에 쓴 번호로 바로 인증번호를 보낸다. 인증을 마치면 온보딩으로 가고, 온보딩 첫 단계에서는 '인증했어요'로만 보인다.
  // 가입 전에 보던 일정이 있으면 프로필을 만든 뒤 그 신청 화면으로 이어 간다
  const onboarding = next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
  // PASS 본인인증이 켜진 환경에서는 온보딩에서 PASS로 번호까지 확인하므로 문자 인증을 건너뛴다
  redirect(idvEnabled() ? onboarding : `/verify/phone?auto=1&next=${encodeURIComponent(onboarding)}`);
}

export async function logout() {
  await clearSession();
  redirect("/");
}

/** 운영자 화면의 로그아웃: 운영자 세션만 지운다 (같은 브라우저의 참가자 세션은 그대로) */
export async function adminLogout() {
  await clearSession("admin");
  redirect("/admin/login");
}
