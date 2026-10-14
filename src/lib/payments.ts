// 결제 승인과 환불을 한곳에서 처리한다. 모의 결제와 토스페이먼츠 결제가 같은 길로 들어온다.
import { PASSES, type PassType, won } from "./constants";
import { logStatus } from "./events";
import { fmtDateTime } from "./format";
import { notify } from "./notify";
import { db } from "./supabase";
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
  const { data: pass } = await db()
    .from("passes")
    .insert({
      user_id: userId,
      pass_type: app.payments.pass_type,
      total_count: passDef.count,
      remaining: passDef.count - 1, // 이번 신청에 1회 사용
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
    })
    .select("id")
    .single();
  await db().from("payments").update({ pass_id: pass!.id }).eq("id", app.payment_id);
  await db().from("applications").update({ payment_status: "PAID" }).eq("id", appId);
  // 결제했으니 예약해 둔 결제 독촉 알림은 보내지 않는다
  await db().from("notifications").delete().eq("status", "pending").like("dedupe_key", `payment_pending:${appId}:%`);
  await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: app.payment_status, to: "PAID", actor: `user:${userId}`, reason: meta.reason });
  await notify({
    userId,
    template: "paid",
    title: "결제가 끝났어요",
    body: `${won(app.payments.amount)} 결제를 확인했어요. ${fmtDateTime(app.rounds.match_at)}에 자동으로 테이블을 꾸려서 알려드릴게요.`,
    link: `/applications/${appId}`,
    dedupeKey: `paid:${appId}:${app.payment_id}`,
  });
  return true;
}

export type RefundResult = { ok: boolean; message: string };

/**
 * 원래 결제수단으로 전액 환불한다 (PAY-03).
 * 토스로 낸 결제는 토스 취소 API를 부르고, 실패하면 환불 실패로 남기고 운영자 예외로 올린다 (자동 재시도는 운영자 화면에서).
 */
export async function refundPayment(paymentId: string, appId: string, actor: string, reason: string): Promise<RefundResult> {
  const { data: p } = await db().from("payments").select("id,status,amount,provider,pg_payment_key").eq("id", paymentId).single();
  if (!p) return { ok: false, message: "결제 정보를 찾지 못했어요." };
  if (p.status === "REFUNDED") return { ok: true, message: `${won(p.amount)}은 이미 돌려드렸어요.` };

  const { data: lock } = await db()
    .from("payments")
    .update({ status: "REFUND_PROCESSING", refund_error: null })
    .eq("id", paymentId)
    .in("status", ["PAID", "REFUND_AVAILABLE", "REFUND_REQUESTED", "REFUND_FAILED"])
    .select("id");
  if (!lock?.length) return { ok: false, message: "이미 환불을 처리하고 있어요." };
  await db().from("applications").update({ payment_status: "REFUND_PROCESSING" }).eq("id", appId);

  if (p.provider === "toss" && p.pg_payment_key) {
    const r = await cancelToss(p.pg_payment_key, reason, `refund-${paymentId}`);
    if (!r.ok) {
      await db().from("payments").update({ status: "REFUND_FAILED", refund_error: `${r.error.code}: ${r.error.message}` }).eq("id", paymentId);
      await db().from("applications").update({ payment_status: "REFUND_FAILED" }).eq("id", appId);
      await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_PROCESSING", to: "REFUND_FAILED", actor: "system", reason: `토스 환불 실패 ${r.error.code}` });
      await db().from("exceptions").upsert(
        { kind: "refund", ref_type: "application", ref_id: appId, reason: `자동 환불 실패: ${r.error.message}`, dedupe_key: `refund:${paymentId}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
      return { ok: false, message: "환불 요청이 결제사에서 실패했어요. 운영팀이 바로 확인해 다시 처리해 드릴게요." };
    }
    await db().from("payments").update({ status: "REFUNDED", refunded_at: new Date().toISOString(), pg_raw: r.data }).eq("id", paymentId);
  } else {
    await db().from("payments").update({ status: "REFUNDED", refunded_at: new Date().toISOString() }).eq("id", paymentId);
  }
  await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId);
  await logStatus({
    entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_PROCESSING", to: "REFUNDED", actor,
    reason: `${reason}: 원결제수단 전액 환불 ${won(p.amount)}${p.provider === "toss" ? " (토스페이먼츠 취소 완료)" : " (모의)"}`,
  });
  return { ok: true, message: `결제하신 수단으로 ${won(p.amount)}을 전액 돌려드렸어요.` };
}
