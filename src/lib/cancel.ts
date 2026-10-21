// 신청 취소 실행. 참가자 본인 취소와 운영자 대리 취소가 같은 함수를 지난다 (판단은 cancel-rules.ts)
import { cancelConfirmed } from "./attendance";
import { releaseUse } from "./billing";
import { type CancelPlan, type CancelTarget, beforeMatchCutoff, planCancel } from "./cancel-rules";
import { now } from "./clock";
import { logStatus } from "./events";
import { notify } from "./notify";
import { quietly, syncScheduled } from "./scheduled";
import { db } from "./supabase";

/** 운영자가 대신 취소한 신청의 참가자 화면 문구. 본인이 취소한 것처럼 보이지 않게 한다 */
export const ADMIN_CANCELED_REASON = "운영팀이 이 신청을 취소했어요. 궁금한 점은 문의해 주세요.";

export type CancelResult = { ok: boolean; message: string; notFound?: boolean };

/**
 * 매칭 전 신청 취소. 매칭 시각 전, 매칭 대기 상태일 때만 된다.
 * 결제했으면 이용권 1회를 돌려주거나 원결제수단으로 환불한다(releaseUse).
 * ownerId를 주면 그 사람의 신청일 때만 된다.
 */
export async function cancelBeforeMatch(appId: string, opts: { actor: string; reason: string; ownerId?: string; byAdmin?: boolean }): Promise<CancelResult> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,rounds(match_at)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; match_status: string; rounds: { match_at: string } } | null;
  if (!app || (opts.ownerId && app.user_id !== opts.ownerId)) return { ok: false, message: "찾을 수 없는 신청이에요", notFound: true };
  if (app.match_status !== "WAITING") return { ok: false, message: "매칭이 시작된 뒤에는 신청을 취소할 수 없어요" };
  // 환불 마감(모임 주 화요일 24:00)과 매칭 시각 중 이른 쪽이 지나면 취소할 수 없다
  const { data: sl } = await db().from("application_slots").select("slots(starts_at)").eq("application_id", appId);
  const starts = ((sl ?? []) as unknown as { slots: { starts_at: string } }[]).map((x) => x.slots.starts_at);
  if (beforeMatchCutoff(app.rounds.match_at, starts) <= (await now())) return { ok: false, message: "환불 마감이 지나 취소할 수 없어요" };

  // 조건부 업데이트: 매칭과 동시에 눌려도 한쪽만 이긴다
  const { data: up } = await db()
    .from("applications")
    .update({ application_status: "CANCELED", match_status: "NO_MATCH", match_reason: opts.byAdmin ? ADMIN_CANCELED_REASON : null })
    .eq("id", appId)
    .eq("match_status", "WAITING")
    .select("id");
  if (!up?.length) return { ok: false, message: "이미 처리된 신청이에요" };
  await logStatus({ entityType: "application", entityId: appId, field: "application_status", from: "SUBMITTED", to: "CANCELED", actor: opts.actor, reason: opts.reason });
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "WAITING", to: "NO_MATCH", actor: opts.actor, reason: opts.reason });

  await quietly(syncScheduled([appId], opts.actor, opts.reason));
  const money = await releaseUse(appId, opts.actor, opts.reason);
  await notify({
    userId: app.user_id,
    template: "canceled",
    title: opts.byAdmin ? "운영팀이 신청을 취소했어요" : "신청을 취소했어요",
    body: "환불·이용권 결과는 내 신청 화면에서 볼 수 있어요",
    link: `/applications/${appId}`,
    dedupeKey: `canceled:${appId}`,
  });
  return { ok: true, message: money };
}

/** 대리 취소 판단에 쓸 신청 정보를 읽는다 */
export async function loadCancelTarget(appId: string): Promise<(CancelTarget & { userId: string }) | null> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,application_status,match_status,attendance_status,payment_status,rounds(match_at),payments(pass_type,amount),application_slots(slots(starts_at)),dining_tables(slots(starts_at))")
    .eq("id", appId)
    .maybeSingle();
  const a = data as unknown as {
    user_id: string; application_status: string; match_status: string; attendance_status: string | null; payment_status: string;
    rounds: { match_at: string }; payments: { pass_type: string | null; amount: number } | null;
    application_slots: { slots: { starts_at: string } }[]; dining_tables: { slots: { starts_at: string } } | null;
  } | null;
  if (!a) return null;
  return {
    userId: a.user_id,
    applicationStatus: a.application_status,
    matchStatus: a.match_status,
    attendanceStatus: a.attendance_status,
    paymentStatus: a.payment_status,
    passType: a.payments?.pass_type ?? null,
    amount: a.payments?.amount ?? null,
    matchAt: a.rounds.match_at,
    starts: a.application_slots.map((x) => x.slots.starts_at),
    tableStartsAt: a.dining_tables?.slots.starts_at ?? null,
  };
}

/** 지금 운영자가 대리 취소하면 어떻게 되는지 (화면 표시용) */
export async function adminCancelPlan(appId: string): Promise<CancelPlan> {
  const t = await loadCancelTarget(appId);
  if (!t) return { ok: false, message: "신청을 찾지 못했어요" };
  return planCancel(t, await now());
}

/**
 * 운영자 대리 취소. 참가자 본인 취소와 같은 규칙으로 판단하고 같은 함수로 처리한다.
 * 사유는 상태 이력에 '운영자 대리 취소: 사유'로 남는다(actor admin:<id>).
 */
export async function adminCancel(appId: string, adminId: string, note: string): Promise<CancelResult> {
  const plan = await adminCancelPlan(appId);
  if (!plan.ok) return { ok: false, message: plan.message };
  const opts = { actor: `admin:${adminId}`, reason: `운영자 대리 취소: ${note}`, byAdmin: true };
  const r = plan.kind === "before_match" ? await cancelBeforeMatch(appId, opts) : await cancelConfirmed(appId, opts);
  if (!r.ok) return r;
  const head = plan.kind === "late" ? "환불 없이 취소했어요." : "신청을 취소했어요.";
  return { ok: true, message: plan.kind === "late" ? head : `${head} ${r.message}` };
}
