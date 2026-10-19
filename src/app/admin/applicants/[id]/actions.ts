"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { adminCancel } from "@/lib/cancel";
import { cleanNote } from "@/lib/cancel-rules";
import { logStatus } from "@/lib/events";
import { ACCOUNT } from "@/lib/labels";
import { adminBack } from "@/lib/members";
import { db } from "@/lib/supabase";

const go = (back: string, k: "m" | "e", msg: string) => {
  const [path, hash] = back.split("#");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
};

/**
 * 운영자가 계정 상태를 바꾼다 (경고·참가 제한·해제). 사유는 꼭 받고 상태 이력에 남긴다.
 * 신청자 상세와 회원 상세가 함께 쓴다. back(어드민 안쪽 경로)이 있으면 그 화면으로 돌아간다
 */
export async function setAccountStatus(form: FormData) {
  const appId = String(form.get("app_id") ?? "");
  const back = adminBack(form.get("back"), appId ? `/admin/applicants/${appId}` : "/admin/members");
  const admin = await requireAdminWrite(back);
  const userId = String(form.get("user_id"));
  const to = String(form.get("to"));
  const note = String(form.get("note") ?? "").trim();
  if (!["active", "warned", "restricted", "banned"].includes(to)) go(back, "e", "알 수 없는 상태예요");
  if (note.length < 4) go(back, "e", "사유를 4자 이상 적어 주세요. 상태 이력에 그대로 남아요");
  const { data: u } = await db().from("users").select("account_status").eq("id", userId).single();
  if (!u) go(back, "e", "회원을 찾지 못했어요");
  if (u!.account_status === to) go(back, "m", "이미 그 상태예요");
  // 제한을 풀면 노쇼 자동 제한 기한도 함께 지운다
  await db().from("users").update(to === "active" || to === "warned" ? { account_status: to, restricted_until: null } : { account_status: to }).eq("id", userId);
  await logStatus({ entityType: "user", entityId: userId, field: "account_status", from: u!.account_status, to, actor: `admin:${admin.id}`, reason: note });
  if (appId) revalidatePath(`/admin/applicants/${appId}`);
  revalidatePath(`/admin/members/${userId}`);
  go(back, "m", `계정 상태를 '${ACCOUNT[to][0]}'(으)로 바꿨어요`);
}

/**
 * 운영자 대리 신청 취소. 참가자 본인 취소와 같은 규칙(환불 마감 전이면 돌려주고, 지나면 환불 없이, 당일은 막음)을 쓴다.
 * 사유는 꼭 받아 상태 이력에 '운영자 대리 취소: 사유'로 남긴다
 */
export async function adminCancelAction(form: FormData) {
  const appId = String(form.get("app_id"));
  const back = adminBack(form.get("back"), `/admin/applicants/${appId}`);
  const admin = await requireAdminWrite(back);
  const note = cleanNote(form.get("note"));
  if (!note) go(back, "e", "취소 사유를 4자 이상 적어 주세요. 상태 이력에 그대로 남아요");
  const r = await adminCancel(appId, admin.id, note!);
  revalidatePath(`/admin/applicants/${appId}`);
  revalidatePath("/admin/payments");
  go(back, r.ok ? "m" : "e", r.message);
}
