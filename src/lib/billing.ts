// 이용권과 환불. 1회권은 돈으로 돌려주고, 보유 이용권으로 신청한 건은 쓴 횟수를 돌려준다.
// 멤버십은 기간 안에 횟수 제한이 없어 돌려줄 횟수가 없고, 매칭에 실패하면 기간을 늘려 준다.
import { MEMBERSHIP_EXTEND_DAYS, isMembership } from "./constants";
import { logStatus } from "./events";
import { fmtDay } from "./format";
import { notify } from "./notify";
import { refundPayment } from "./payments";
import { db } from "./supabase";

type PayRow = { id: string; status: string; amount: number; pass_type: string | null; pass_id: string | null };

/** 신청에 쓴 결제를 되돌린다. 무엇을 했는지 사람이 읽을 문장으로 돌려준다 */
export async function releaseUse(appId: string, actor: string, reason: string): Promise<string> {
  const { data } = await db()
    .from("applications")
    .select("id,payment_status,payments(id,status,amount,pass_type,pass_id)")
    .eq("id", appId)
    .single();
  const app = data as unknown as { id: string; payment_status: string; payments: PayRow | null };
  const p = app?.payments;
  if (!p || app.payment_status !== "PAID") return "결제 전이라 따로 돌려드릴 금액은 없어요.";

  if (isMembership(p.pass_type)) {
    await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId).eq("payment_status", "PAID");
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUNDED", actor, reason: `${reason}: 멤버십 신청 취소(차감 없음)` });
    return "멤버십은 횟수를 쓰지 않아서 기간 안에 다른 일정을 바로 신청할 수 있어요.";
  }
  const returnsUse = p.amount === 0 || p.pass_type === "subscription";
  if (returnsUse && p.pass_id) {
    // 결제 상태를 먼저 조건부로 바꾸고, 이긴 쪽만 횟수를 돌려준다 (두 취소가 겹쳐도 1회만)
    const { data: claimed } = await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId).eq("payment_status", "PAID").select("id");
    if (!claimed?.length) return "이미 돌려드렸어요.";
    const { data: pass } = await db().from("passes").select("remaining").eq("id", p.pass_id).single();
    await db().from("passes").update({ remaining: (pass?.remaining ?? 0) + 1 }).eq("id", p.pass_id);
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUNDED", actor, reason: `${reason}: 이용권 1회 반환` });
    return "쓴 이용권 1회를 돌려드렸어요. 다음 일정에 그대로 쓸 수 있어요.";
  }
  // 1회권: 원결제수단으로 전액 환불 (토스 결제면 토스 취소 API)
  // 취소 안내(attendance_canceled)에 결과를 담으니 환불 접수·완료 알림은 따로 안 보낸다. 실패해 재시도로 끝나면 그때 알린다
  const r = await refundPayment(p.id, appId, actor, reason, { notifyUser: false });
  if (r.ok && p.pass_id) await db().from("passes").update({ remaining: 0 }).eq("id", p.pass_id);
  return r.message;
}

/** 지금 쓸 수 있는 보유 이용권. 기간 안의 멤버십을 먼저, 없으면 남은 횟수가 있는 이용권(기한이 빠른 순) */
export async function usablePass(userId: string, at: Date) {
  const { data } = await db()
    .from("passes")
    .select("id,pass_type,remaining,total_count,expires_at")
    .eq("user_id", userId)
    .order("expires_at", { ascending: true });
  const live = (data ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > at);
  return live.find((p) => isMembership(p.pass_type)) ?? live.find((p) => p.remaining > 0) ?? null;
}

/**
 * 멤버십으로 낸 신청이 매칭에 실패하면 기간을 7일 늘린다(운영사 Q&A). 같은 신청은 한 번만.
 * 늘렸으면 true
 */
export async function extendMembershipFor(appId: string, actor: string): Promise<boolean> {
  const { data } = await db().from("applications").select("id,user_id,payments(pass_type,pass_id)").eq("id", appId).maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payments: { pass_type: string | null; pass_id: string | null } | null } | null;
  const passId = app?.payments?.pass_id;
  if (!app || !passId || !isMembership(app.payments?.pass_type)) return false;
  const { data: done } = await db().from("status_events").select("id").eq("entity_type", "application").eq("entity_id", appId).eq("field", "membership_extend").limit(1);
  if (done?.length) return false;
  const { data: pass } = await db().from("passes").select("expires_at").eq("id", passId).single();
  const base = pass?.expires_at ? new Date(pass.expires_at) : new Date();
  const next = new Date(base.getTime() + MEMBERSHIP_EXTEND_DAYS * 86400_000);
  await db().from("passes").update({ expires_at: next.toISOString() }).eq("id", passId);
  await logStatus({ entityType: "application", entityId: appId, field: "membership_extend", from: base.toISOString(), to: next.toISOString(), actor, reason: `매칭 실패로 멤버십 ${MEMBERSHIP_EXTEND_DAYS}일 연장` });
  await logStatus({ entityType: "pass", entityId: passId, field: "expires_at", from: base.toISOString(), to: next.toISOString(), actor, reason: `신청 ${appId.slice(0, 8)} 매칭 실패` });
  const ymd = fmtDay(next.toISOString());
  await notify({ userId: app.user_id, template: "membership_extended", title: `멤버십 기간을 ${MEMBERSHIP_EXTEND_DAYS}일 늘렸어요`, body: `${ymd}까지 쓸 수 있어요`, link: "/me", dedupeKey: `membership_extend:${appId}` });
  return true;
}
