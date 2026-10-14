"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { clearSession, setSession } from "@/lib/session";

const normalize = (s: string) => s.trim().replace(/-/g, "");

export async function login(form: FormData) {
  const id = normalize(String(form.get("login_id") ?? ""));
  const pw = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!id || !pw) redirect(`/login/phone?e=${encodeURIComponent("아이디와 비밀번호를 입력해 주세요")}`);

  const { data: user } = await db()
    .from("users")
    .select("id,role,password_hash,account_status")
    .eq("login_id", id)
    .maybeSingle();
  if (!user || !user.password_hash || !(await bcrypt.compare(pw, user.password_hash))) {
    redirect(`/login/phone?e=${encodeURIComponent("아이디나 비밀번호가 맞지 않아요")}`);
  }
  if (user.account_status === "banned") {
    redirect(`/login/phone?e=${encodeURIComponent("이용이 제한된 계정이에요. 운영팀에 문의해 주세요")}`);
  }
  await setSession({ uid: user.id, role: user.role });
  redirect(user.role === "admin" ? "/admin" : next.startsWith("/") ? next : "/");
}

export async function signup(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const phone = normalize(String(form.get("phone") ?? ""));
  const pw = String(form.get("password") ?? "");
  const back = (m: string) => redirect(`/signup?e=${encodeURIComponent(m)}`);

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
  redirect("/onboarding");
}

export async function logout() {
  await clearSession();
  redirect("/");
}
