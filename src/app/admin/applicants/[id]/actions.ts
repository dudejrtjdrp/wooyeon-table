"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";

/** 운영자가 계정 상태를 바꾼다 (경고·참가 제한·해제). 이유는 상태 이력에 남는다 */
export async function setAccountStatus(form: FormData) {
  const admin = await requireAdmin();
  const userId = String(form.get("user_id"));
  const appId = String(form.get("app_id"));
  const to = String(form.get("to"));
  const note = String(form.get("note") ?? "").trim();
  if (!["active", "warned", "restricted", "banned"].includes(to)) return;
  const { data: u } = await db().from("users").select("account_status").eq("id", userId).single();
  if (!u || u.account_status === to) return;
  await db().from("users").update({ account_status: to }).eq("id", userId);
  await logStatus({ entityType: "user", entityId: userId, field: "account_status", from: u.account_status, to, actor: `admin:${admin.id}`, reason: note || "운영자 조치" });
  revalidatePath(`/admin/applicants/${appId}`);
}
