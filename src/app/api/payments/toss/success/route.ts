// 토스 결제창에서 결제 인증이 끝나면 여기로 돌아온다. 금액·주문번호를 서버 기록과 맞춰 본 뒤 승인 API를 부른다.
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { markPaid } from "@/lib/payments";
import { now } from "@/lib/clock";
import { db } from "@/lib/supabase";
import { confirmToss, methodLabel } from "@/lib/toss";

export const dynamic = "force-dynamic";

/** 참가자 쪽 사유로 생기는 토스 승인 실패 코드(앞부분). 이 경우는 다시 결제하면 되므로 예외로 올리지 않는다 */
const USER_SIDE = ["PAY_PROCESS_", "REJECT_", "INVALID_CARD", "EXCEED_", "NOT_ENOUGH_", "BELOW_", "INVALID_PASSWORD", "INCORRECT_", "EXCEED_MAX"];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const appId = q.get("app") ?? "";
  const paymentKey = q.get("paymentKey") ?? "";
  const orderId = q.get("orderId") ?? "";
  const amount = Number(q.get("amount"));
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  const fail = (m: string) => to(`/pay/${appId}?e=${encodeURIComponent(m)}`);
  // 참가자가 고칠 수 없는 결제 이상(금액·주문 불일치, 결제사 쪽 오류)은 운영자 예외로 올린다 (A3·15장)
  const raise = (paymentId: string, reason: string, key: string) =>
    db().from("exceptions").upsert(
      { kind: "payment", ref_type: "application", ref_id: appId, reason, dedupe_key: `payment:${paymentId}:${key}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );

  const me = await getMe();
  if (!me) return to(`/login?next=/pay/${appId}`);
  const { data } = await db().from("applications").select("id,user_id,payment_id,rounds(match_at),payments(id,status,amount)").eq("id", appId).maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payment_id: string; rounds: { match_at: string }; payments: { id: string; status: string; amount: number } } | null;
  if (!app || app.user_id !== me.id) return to("/");
  if (app.payments.status === "PAID") return to(`/applications/${appId}`);
  // 결제창에서 넘어온 값은 바뀔 수 있으니 서버 기록과 맞는지 먼저 본다
  if (!orderId.startsWith(`wt-${app.payment_id}-`)) {
    await raise(app.payment_id, `결제창에서 돌아온 주문번호가 이 신청과 맞지 않아요(위변조 의심) (${orderId})`, "order");
    return fail("주문 정보가 맞지 않아요. 다시 결제해 주세요");
  }
  if (amount !== app.payments.amount) {
    await raise(app.payment_id, `결제 금액이 맞지 않아요(위변조 의심): 결제창 ${amount}원, 신청 ${app.payments.amount}원`, "amount");
    return fail("결제 금액이 맞지 않아요. 다시 결제해 주세요");
  }

  // 결제창을 연 사이 매칭 시각이 지났으면 승인하지 않는다(승인 전이라 돈이 빠져나가지 않는다)
  if (new Date(app.rounds.match_at) <= (await now())) return to(`/pay/${appId}`);
  const r = await confirmToss(paymentKey, orderId, amount);
  if (!r.ok) {
    await db().from("payments").update({ status: "FAILED", pg_order_id: orderId }).eq("id", app.payment_id).eq("status", "PENDING");
    await db().from("applications").update({ payment_status: "FAILED" }).eq("id", appId).eq("payment_status", "PENDING");
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PENDING", to: "FAILED", actor: `user:${me.id}`, reason: `토스 승인 실패 ${r.error.code}` });
    // 잔액 부족·카드 거절·사용자 취소처럼 참가자가 다시 하면 되는 실패는 화면 안내로 끝내고, 그 밖의 결제사 오류만 운영자에게
    if (!USER_SIDE.some((c) => r.error.code.startsWith(c))) await raise(app.payment_id, `토스 승인 실패 ${r.error.code}: ${r.error.message}`, r.error.code);
    return fail(r.error.message);
  }
  await markPaid(appId, me.id, {
    provider: "toss",
    method: methodLabel(r.data),
    pgPaymentKey: r.data.paymentKey,
    pgOrderId: r.data.orderId,
    receiptUrl: r.data.receipt?.url ?? null,
    raw: r.data,
    reason: `토스페이먼츠 결제 승인 (${methodLabel(r.data)})`,
  });
  return to(`/applications/${appId}?m=${encodeURIComponent("결제가 끝났어요")}`);
}
