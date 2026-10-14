"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

const METHODS = [
  { v: "card", l: "신용·체크카드" },
  { v: "kakaopay", l: "카카오페이", easy: "KAKAOPAY" },
  { v: "naverpay", l: "네이버페이", easy: "NAVERPAY" },
  { v: "tosspay", l: "토스페이", easy: "TOSSPAY" },
] as const;

type Props = {
  clientKey: string;
  customerKey: string;
  customerName: string;
  appId: string;
  paymentId: string;
  amount: number;
  amountText: string;
  orderName: string;
  live: boolean;
};

/** 토스페이먼츠 결제창을 연다. 승인은 돌아온 뒤 서버에서 한다 */
export function TossCheckout(p: Props) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["v"]>("card");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const toss = await loadTossPayments(p.clientKey);
      const payment = toss.payment({ customerKey: p.customerKey });
      const m = METHODS.find((x) => x.v === method)!;
      const origin = window.location.origin;
      const orderId = `wt-${p.paymentId}-${Date.now().toString(36)}`;
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: p.amount },
        orderId,
        orderName: p.orderName,
        customerName: p.customerName,
        successUrl: `${origin}/api/payments/toss/success?app=${p.appId}`,
        failUrl: `${origin}/api/payments/toss/fail?app=${p.appId}`,
        card: "easy" in m
          ? { flowMode: "DIRECT", easyPay: m.easy, useEscrow: false, useCardPoint: false, useAppCardOnly: false }
          : { flowMode: "DEFAULT", useEscrow: false, useCardPoint: false, useAppCardOnly: false },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      // 결제창을 그냥 닫은 경우는 오류로 보지 않는다
      if (code !== "USER_CANCEL" && code !== "PAY_PROCESS_CANCELED") setErr((e as Error).message || "결제창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mt-3 rounded-3xl bg-card p-5">
        <p className="text-[17px] font-bold">결제 수단</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup">
          {METHODS.map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={method === m.v}
              onClick={() => setMethod(m.v)}
              className={`rounded-2xl border py-3.5 text-center text-[15px] transition ${method === m.v ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line"}`}
            >
              {m.l}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
          <span className="mt-0.5 shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">toss payments</span>
          <span>
            {p.live
              ? "토스페이먼츠 결제창에서 안전하게 결제돼요."
              : "토스페이먼츠 테스트 결제창이에요. 카드 정보를 넣어도 실제로 돈이 나가지 않아요."}
          </span>
        </div>
        {err && <p className="mt-3 text-[13px] font-medium text-danger">{err}</p>}
      </section>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
        <div className="pb-3">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-white transition active:scale-[.985] disabled:opacity-50"
          >
            {busy ? "결제창 여는 중" : `${p.amountText} 결제하기`}
          </button>
        </div>
      </div>
    </>
  );
}
