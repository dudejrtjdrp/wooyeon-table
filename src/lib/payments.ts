// 결제 승인과 환불을 한곳에서 처리한다. 모의 결제와 토스페이먼츠 결제가 같은 길로 들어온다.
import { PASSES, type PassType, won } from "./constants";
import { logStatus } from "./events";
import { fmtSlot } from "./format";
import { notify } from "./notify";
import { db } from "./supabase";
import { loadTemplates, render } from "./templates";
import { cancelToss } from "./toss";

type PaidMeta = {
  provider: "mock" | "toss";
  method?: string | null;
  pgPaymentKey?: string;
  pgOrderId?: string;
  receiptUrl?: string | null;
  raw?: unknown;
  reason: string;
};

/** 신청의 결제를 승인 처리한다. 대기·실패 상태일 때만 바뀌어서 두 번 불러도 한 번만 승인된다 */
export async function markPaid(appId: string, userId: string, meta: PaidMeta): Promise<boolean> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,payment_id,payment_status,rounds(title,match_at),payments(id,status,pass_type,amount)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; payment_id: string; payment_status: string;
    rounds: { title: string; match_at: string };
    payments: { id: string; status: string; pass_type: PassType; amount: number };
  } | null;
  if (!app || app.user_id !== userId) return false;

  const { data: updated } = await db()
    .from("payments")
    .update({
      status: "PAID",
      paid_at: new Date().toISOString(),
      provider: meta.provider,
      method: meta.method ?? null,
      pg_payment_key: meta.pgPaymentKey ?? null,
      pg_order_id: meta.pgOrderId ?? null,
      receipt_url: meta.receiptUrl ?? null,
      pg_raw: meta.raw ?? null,
    })
    .eq("id", app.payment_id)
    .in("status", ["PENDING", "FAILED"])
    .select("id");
  if (!updated?.length) return false;

  const passDef = PASSES[app.payments.pass_type] ?? PASSES.single;
  // 멤버십은 산 날부터 N개월, 횟수 없음. 1회권은 이번 신청에 바로 1회를 쓴다(유효 60일)
  const expires = new Date();
  if (passDef.months) expires.setMonth(expires.getMonth() + passDef.months);
  else expires.setDate(expires.getDate() + 60);
  const { data: pass } = await db()
    .from("passes")
    .insert({
      user_id: userId,
      pass_type: app.payments.pass_type,
      total_count: passDef.count,
      remaining: Math.max(0, passDef.count - 1),
      expires_at: expires.toISOString(),
    })
    .select("id")
    .single();
  await db().from("payments").update({ pass_id: pass!.id }).eq("id", app.payment_id);
  await db().from("applications").update({ payment_status: "PAID" }).eq("id", appId);
  // 결제했으니 예약해 둔 결제 독촉 알림은 보내지 않는다
  await db().from("notifications").delete().eq("status", "pending").like("dedupe_key", `payment_pending:${appId}:%`);
  await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: app.payment_status, to: "PAID", actor: `user:${userId}`, reason: meta.reason });
  // 다시 결제해 끝났으면 이 결제에 걸려 있던 결제 오류 예외는 자동으로 닫는다
  await db().from("exceptions").update({ status: "resolved", resolution: "참가자가 다시 결제해 해결(자동)", resolved_at: new Date().toISOString() }).like("dedupe_key", `payment:${app.payment_id}:%`).eq("status", "open");
  await notify({
    userId,
    template: "paid",
    ...render("paid", { amount: won(app.payments.amount), match_at: fmtSlot(app.rounds.match_at) }, await loadTemplates()),
    link: `/applications/${appId}`,
    dedupeKey: `paid:${appId}:${app.payment_id}`,
  });
  return true;
}

export type RefundResult = { ok: boolean; message: string };

/** 자동 환불은 이만큼 실패하면 운영자에게 넘긴다 */
export const REFUND_MAX_TRIES = 3;
/** 실패한 환불을 다시 시도하는 간격 */
export const REFUND_RETRY_GAP_MS = 10 * 60_000;

/** 이 신청의 환불이 몇 번 실패했는지와 마지막 실패 시각 (status_events) */
export async function refundFailures(appId: string): Promise<{ count: number; last: Date | null }> {
  const { data } = await db()
    .from("status_events")
    .select("created_at")
    .eq("entity_type", "application")
    .eq("entity_id", appId)
    .eq("field", "payment_status")
    .eq("to_value", "REFUND_FAILED")
    .order("created_at", { ascending: false });
  return { count: data?.length ?? 0, last: data?.[0] ? new Date(data[0].created_at) : null };
}

/**
 * 원래 결제수단으로 전액 환불한다 (PAY-03).
 * 토스로 낸 결제는 토스 취소 API를 부른다. 실패하면 REFUND_FAILED로 두고 tick이 10분 간격으로 다시 시도하며(retryRefunds),
 * 세 번째 실패에서만 운영자 예외로 올린다 (D7).
 * notifyUser: 환불 접수·완료 알림을 보낼지. 참석 취소처럼 부른 쪽이 따로 안내하면 false (재시도에서 끝나면 그때는 알린다)
 */
export async function refundPayment(paymentId: string, appId: string, actor: string, reason: string, opts: { notifyUser?: boolean } = {}): Promise<RefundResult> {
  const notifyUser = opts.notifyUser ?? true;
  const { data: p } = await db().from("payments").select("id,status,amount,provider,pg_payment_key,pass_id").eq("id", paymentId).single();
  if (!p) return { ok: false, message: "결제 정보를 찾지 못했어요." };
  if (p.status === "REFUNDED") return { ok: true, message: `${won(p.amount)}은 이미 돌려드렸어요.` };

  const { data: lock } = await db()
    .from("payments")
    .update({ status: "REFUND_PROCESSING", refund_error: null })
    .eq("id", paymentId)
    .in("status", ["PAID", "REFUND_AVAILABLE", "REFUND_REQUESTED", "REFUND_FAILED"])
    .select("id");
  if (!lock?.length) return { ok: false, message: "이미 환불을 처리하고 있어요." };
  const { data: app } = await db().from("applications").select("user_id,payment_status").eq("id", appId).maybeSingle();
  await db().from("applications").update({ payment_status: "REFUND_PROCESSING" }).eq("id", appId);
  const tpl = await loadTemplates();
  const amount = won(p.amount);
  const tell = async (key: "refund_requested" | "refunded" | "refund_retry" | "refund_failed", dedupeKey: string) => {
    if (!app?.user_id) return;
    const m = render(key, { amount }, tpl);
    await notify({ userId: app.user_id, template: key, title: m.title, body: m.body, link: `/applications/${appId}`, dedupeKey });
  };
  // 14장 '환불 요청': 처음 접수할 때 한 번 (재시도에서는 다시 안 보낸다)
  if (notifyUser && app?.payment_status !== "REFUND_FAILED") await tell("refund_requested", `refund_requested:${paymentId}`);

  if (p.provider === "toss" && p.pg_payment_key) {
    const r = await cancelToss(p.pg_payment_key, reason, `refund-${paymentId}`);
    if (!r.ok) {
      await db().from("payments").update({ status: "REFUND_FAILED", refund_error: `${r.error.code}: ${r.error.message}` }).eq("id", paymentId);
      await db().from("applications").update({ payment_status: "REFUND_FAILED" }).eq("id", appId);
      await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_PROCESSING", to: "REFUND_FAILED", actor: "system", reason: `토스 환불 실패 ${r.error.code}: ${r.error.message}` });
      const { count } = await refundFailures(appId);
      if (count >= REFUND_MAX_TRIES) {
        await db().from("exceptions").upsert(
          { kind: "refund", ref_type: "application", ref_id: appId, reason: `자동 환불이 ${count}번 실패했어요: ${r.error.message}`, dedupe_key: `refund:${paymentId}` },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
        await tell("refund_failed", `refund_gave_up:${appId}`);
        return { ok: false, message: "자동 환불이 세 번 되지 않아 운영팀이 직접 처리해 드릴게요. 따로 하실 일은 없어요." };
      }
      // 다시 시도 중이라는 알림은 보내지 않는다(참가자가 할 일이 없음). 상태는 내 신청 화면에 보인다
      return { ok: false, message: "결제사에서 환불이 한 번에 되지 않았어요. 10분 뒤 자동으로 다시 시도할게요. 따로 하실 일은 없어요." };
    }
    await db().from("payments").update({ status: "REFUNDED", refunded_at: new Date().toISOString(), pg_raw: r.data }).eq("id", paymentId);
  } else {
    await db().from("payments").update({ status: "REFUNDED", refunded_at: new Date().toISOString() }).eq("id", paymentId);
  }
  await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId);
  // 1회권은 돈으로 돌려줬으니 남은 횟수가 없다
  if (p.pass_id) await db().from("passes").update({ remaining: 0 }).eq("id", p.pass_id);
  await logStatus({
    entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_PROCESSING", to: "REFUNDED", actor,
    reason: `${reason}: 원결제수단 전액 환불 ${amount}${p.provider === "toss" ? " (토스페이먼츠 취소 완료)" : " (모의)"}`,
  });
  // 운영자에게 넘어가 있던 환불 실패 건이면 닫는다
  await db().from("exceptions").update({ status: "resolved", resolution: "환불 다시 시도 성공", resolved_at: new Date().toISOString() }).eq("dedupe_key", `refund:${paymentId}`).eq("status", "open");
  if (notifyUser || app?.payment_status === "REFUND_FAILED") await tell("refunded", `refunded:${appId}`);
  return { ok: true, message: `결제하신 수단으로 ${amount}을 전액 돌려드렸어요.` };
}

/** tick에서 부른다: 실패한 환불을 10분 간격으로 세 번까지 다시 시도한다 (멱등 키가 있어 두 번 환불되지 않는다) */
export async function retryRefunds(): Promise<{ retried: number; done: number }> {
  const res = { retried: 0, done: 0 };
  const { data } = await db().from("applications").select("id,payment_id").eq("payment_status", "REFUND_FAILED").not("payment_id", "is", null).limit(50);
  for (const a of data ?? []) {
    const f = await refundFailures(a.id);
    if (f.count >= REFUND_MAX_TRIES) continue; // 운영자에게 넘어간 건
    if (f.last && Date.now() - f.last.getTime() < REFUND_RETRY_GAP_MS) continue;
    const r = await refundPayment(a.payment_id, a.id, "system", `자동 환불 다시 시도 (${f.count + 1}번째)`);
    res.retried++;
    if (r.ok) res.done++;
  }
  return res;
}
