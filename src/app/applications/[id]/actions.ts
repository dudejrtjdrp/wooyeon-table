"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { cancelAttendance, declineReallocation } from "@/lib/attendance";
import { releaseUse } from "@/lib/billing";
import { roundCutoff } from "@/lib/policy";
import { db } from "@/lib/supabase";

/**
 * 매칭 전 신청 취소. 매칭 시각 전, 매칭 대기 상태일 때만 된다.
 * 결제했으면 이용권 1회를 돌려주거나(정기권) 원결제수단으로 환불(모의)한다.
 */
export async function cancelApplication(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,payment_status,payment_id,rounds(title,match_at),payments(id,pass_id,status)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; match_status: string; payment_status: string; payment_id: string | null;
    rounds: { title: string; match_at: string };
    payments: { id: string; pass_id: string | null; status: string } | null;
  } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  const back = (m: string) => redirect(`/applications/${appId}?e=${encodeURIComponent(m)}`);
  if (app.match_status !== "WAITING") back("매칭이 시작된 뒤에는 신청을 취소할 수 없어요");
  // 환불 마감(모임 주 화요일 24:00)과 매칭 시각 중 이른 쪽이 지나면 취소할 수 없다
  const { data: sl } = await db().from("application_slots").select("slots(starts_at)").eq("application_id", appId);
  const starts = ((sl ?? []) as unknown as { slots: { starts_at: string } }[]).map((x) => x.slots.starts_at);
  const cut = Math.min(new Date(app.rounds.match_at).getTime(), roundCutoff(starts)?.getTime() ?? Infinity);
  if (cut <= (await now()).getTime()) back("환불 마감이 지나 취소할 수 없어요");

  // 조건부 업데이트: 매칭과 동시에 눌려도 한쪽만 이긴다
  const { data: up } = await db()
    .from("applications")
    .update({ application_status: "CANCELED", match_status: "NO_MATCH" })
    .eq("id", appId)
    .eq("match_status", "WAITING")
    .select("id");
  if (!up?.length) back("이미 처리된 신청이에요");
  await logStatus({ entityType: "application", entityId: appId, field: "application_status", from: "SUBMITTED", to: "CANCELED", actor: `user:${me.id}`, reason: "매칭 전 취소" });

  await db().from("notifications").delete().eq("status", "pending").like("dedupe_key", `payment_pending:${appId}:%`);
  const body = await releaseUse(appId, `user:${me.id}`, "매칭 전 취소");
  await notify({ userId: me.id, template: "canceled", title: "신청을 취소했어요", body: `${app.rounds.title} 신청을 취소했어요. ${body}`, link: "/rounds", dedupeKey: `canceled:${appId}` });
  redirect(`/applications/${appId}`);
}

/** 확정된 모임 참석 취소 (모임 주 화요일 24:00 전까지 전액 환불, 그 뒤는 환불 없음, 당일 불가) */
export async function cancelAttendanceAction(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const back = String(form.get("back") ?? `/applications/${appId}`);
  const r = await cancelAttendance(appId, me.id);
  redirect(r.ok ? `/applications/${appId}?m=${encodeURIComponent("참석을 취소했어요")}` : `${back}?e=${encodeURIComponent(r.message)}`);
}

/** 자동으로 옮겨진 테이블이 싫을 때: 매칭 실패 상태로 돌려 다른 방법(이동·기다리기·보관·환불)을 고르게 한다 */
export async function declineReallocationAction(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const r = await declineReallocation(appId, me.id);
  if (!r.ok) redirect(`/applications/${appId}?e=${encodeURIComponent(r.message)}`);
  redirect(`/applications/${appId}/resolve`);
}
