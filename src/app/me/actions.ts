"use server";

import { redirect } from "next/navigation";
import { quietly, syncUser } from "@/lib/scheduled";
import { requireMe } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { clearSession } from "@/lib/session";
import { db } from "@/lib/supabase";

/**
 * 회원 탈퇴. 진행 중인 신청이 있으면 먼저 취소해야 한다.
 * 개인정보(이름·연락처·프로필·소셜 연결)는 바로 지우고, 결제 기록(5년)과 신고 기록(1년)은
 * 처리방침에 적은 기간만 이름 없이 남긴다.
 */
export async function withdraw() {
  const me = await requireMe();
  const { data: live } = await db()
    .from("applications")
    .select("id,match_status,attendance_status,application_status")
    .eq("user_id", me.id)
    .neq("application_status", "CANCELED");
  const busy = (live ?? []).some(
    (a) => ["WAITING", "MATCHING", "REALLOCATING", "ALTERNATIVE_OFFERED"].includes(a.match_status) || (a.match_status === "CONFIRMED" && a.attendance_status === "SCHEDULED"),
  );
  if (busy) redirect(`/me?e=${encodeURIComponent("진행 중인 신청이 있어요. 신청을 먼저 취소하거나 모임을 마친 뒤 탈퇴할 수 있어요")}`);

  await db().from("profiles").delete().eq("user_id", me.id);
  await db().from("user_identities").delete().eq("user_id", me.id);
  await db().from("push_subscriptions").delete().eq("user_id", me.id);
  await db().from("phone_verifications").delete().eq("user_id", me.id);
  await db()
    .from("users")
    .update({ name: "탈퇴한 사용자", phone: null, email: null, avatar_url: null, password_hash: null, ci_hash: null, birth_date: null, login_id: `deleted:${me.id}`, deleted_at: new Date().toISOString() })
    .eq("id", me.id);
  await logStatus({ entityType: "user", entityId: me.id, field: "account_status", from: "active", to: "withdrawn", actor: `user:${me.id}`, reason: "회원 탈퇴" });
  // 아직 안 나간 예약 알림(후기 다시 요청 등)은 보내지 않는다
  await quietly(syncUser(me.id, `user:${me.id}`, "회원 탈퇴"));
  await clearSession("user");
  redirect("/login?m=" + encodeURIComponent("탈퇴했어요. 그동안 함께해 주셔서 고마워요"));
}
