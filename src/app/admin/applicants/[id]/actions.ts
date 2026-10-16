"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { ACCOUNT } from "@/lib/labels";
import { db } from "@/lib/supabase";

/** 운영자가 계정 상태를 바꾼다 (경고·참가 제한·해제). 사유는 꼭 받고 상태 이력에 남긴다 */
export async function setAccountStatus(form: FormData) {
  const appId = String(form.get("app_id"));
  const back = (k: "m" | "e", msg: string) => redirect(`/admin/applicants/${appId}?${k}=${encodeURIComponent(msg)}`);
  const admin = await requireAdminWrite(`/admin/applicants/${appId}`);
  const userId = String(form.get("user_id"));
  const to = String(form.get("to"));
  const note = String(form.get("note") ?? "").trim();
  if (!["active", "warned", "restricted", "banned"].includes(to)) back("e", "알 수 없는 상태예요");
  if (note.length < 4) back("e", "사유를 4자 이상 적어 주세요. 상태 이력에 그대로 남아요");
  const { data: u } = await db().from("users").select("account_status").eq("id", userId).single();
  if (!u) back("e", "회원을 찾지 못했어요");
  if (u!.account_status === to) back("m", "이미 그 상태예요");
  // 제한을 풀면 노쇼 자동 제한 기한도 함께 지운다
  await db().from("users").update(to === "active" || to === "warned" ? { account_status: to, restricted_until: null } : { account_status: to }).eq("id", userId);
  await logStatus({ entityType: "user", entityId: userId, field: "account_status", from: u!.account_status, to, actor: `admin:${admin.id}`, reason: note });
  revalidatePath(`/admin/applicants/${appId}`);
  back("m", `계정 상태를 '${ACCOUNT[to][0]}'(으)로 바꿨어요`);
}
