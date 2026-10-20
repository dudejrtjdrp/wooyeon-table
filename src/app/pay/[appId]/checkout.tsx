"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { AlertCircle, CreditCard } from "lucide-react";
import { PAY_DEMO_HINT } from "@/lib/constants";

const ICON: Record<string, React.ReactNode> = {
  card: <CreditCard size={20} className="text-accent" />,
  kakaopay: <span className="flex size-6 items-center justify-center rounded-md bg-[#FEE500]"><svg width="15" height="15" viewBox="0 0 24 24"><path fill="#3b1e1e" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.1 1.62.1 5.52 0 10-3.54 10-7.87S17.52 3 12 3z" /></svg></span>,
  naverpay: <span className="flex size-6 items-center justify-center rounded-md bg-[#03C75A]"><svg width="11" height="11" viewBox="0 0 24 24"><path fill="#fff" d="M16.27 12.84 7.38 0H0v24h7.73V11.16L16.62 24H24V0h-7.73z" /></svg></span>,
  tosspay: <span className="flex size-6 items-center justify-center rounded-md bg-[#0064FF] text-[11px] font-black text-white">t</span>,
};

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
      <section className="mt-3 rounded-[22px] bg-field p-5">
        <p className="text-[17px] font-bold text-ink">결제 수단<span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 align-middle text-[11px] font-semibold text-accent">필수</span></p>
        <div className="mt-2 divide-y divide-line" role="radiogroup">
          {METHODS.map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={method === m.v}
              onClick={() => setMethod(m.v)}
              className="flex w-full items-center gap-4 py-3 text-left"
            >
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition ${method === m.v ? "border-accent" : "border-line"}`}>
                {method === m.v && <span className="size-3 rounded-full bg-accent" />}
              </span>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-field">{ICON[m.v]}</span>
              <span className={`text-[16px] ${method === m.v ? "font-semibold text-ink" : "text-ink"}`}>{m.l}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="mt-3 flex items-start gap-3 rounded-[20px] border border-[#f3dfb8] bg-warn-soft px-4 py-3.5">
        <AlertCircle size={22} className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="text-[15px] font-semibold text-warn">{p.live ? "토스페이먼츠로 안전하게 결제돼요" : "지금은 테스트 결제예요"}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#6b5410]">
            {p.live ? "카드 정보는 우연한 식탁에 저장되지 않아요." : "토스페이먼츠 테스트 결제창이라 실제로 금액이 청구되지 않아요."}
          </p>
        </div>
      </div>
      {err && (
        <div role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">
          <p>{err}</p>
          {!p.live && <p className="mt-1 font-semibold">{PAY_DEMO_HINT}</p>}
        </div>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line2 bg-paper px-5 pt-3">
        <div className="pb-3">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="shadow-cta flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-white transition active:scale-[.985] disabled:opacity-50"
          >
            {busy ? "결제창 여는 중" : `${p.amountText} 결제하기`}
          </button>
        </div>
      </div>
    </>
  );
}
