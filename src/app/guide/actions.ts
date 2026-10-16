"use server";

import { redirect } from "next/navigation";
import { setSession } from "@/lib/session";
import { db } from "@/lib/supabase";

/**
 * 심사용: 시연 계정(is_demo)으로만 비밀번호 없이 들어간다.
 * to가 있으면 들어간 뒤 그 화면으로 바로 보낸다 (우리 사이트 안 경로만, 참가자는 어드민으로 못 감).
 */
export async function demoLogin(form: FormData) {
  const loginId = String(form.get("login_id") ?? "");
  const to = String(form.get("to") ?? "");
  const { data: u } = await db().from("users").select("id,role,is_demo").eq("login_id", loginId).maybeSingle();
  if (!u || !u.is_demo) redirect("/guide");
  await setSession({ uid: u.id, role: u.role });
  const safe = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") && (u.role === "admin" || !to.startsWith("/admin"));
  redirect(safe ? to : u.role === "admin" ? "/admin" : "/");
}
