"use server";

import { redirect } from "next/navigation";
import { setSession } from "@/lib/session";
import { db } from "@/lib/supabase";

/** 심사용: 시연 계정(is_demo)으로만 비밀번호 없이 들어간다 */
export async function demoLogin(form: FormData) {
  const loginId = String(form.get("login_id") ?? "");
  const { data: u } = await db().from("users").select("id,role,is_demo").eq("login_id", loginId).maybeSingle();
  if (!u || !u.is_demo) redirect("/guide");
  await setSession({ uid: u.id, role: u.role });
  redirect(u.role === "admin" ? "/admin" : "/");
}
