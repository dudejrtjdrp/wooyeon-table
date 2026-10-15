"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/client";

type Opt = { id: string; label: string; note: string; hot: boolean };
type Act = (f: FormData) => void | Promise<void>;

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

/** 실패했을 때 고를 수 있는 세 가지. 고른 것에 따라 아래 버튼이 바뀐다 */
export function ResolveChoice({ appId, options, actions }: { appId: string; options: Opt[]; actions: { transfer: Act; keepPass: Act; refund: Act } }) {
  const [choice, setChoice] = useState<"transfer" | "keep" | "refund">(options.length ? "transfer" : "keep");
  const [slot, setSlot] = useState(options[0]?.id ?? "");
  const cur = options.find((o) => o.id === slot);
  const action = choice === "transfer" ? actions.transfer : choice === "keep" ? actions.keepPass : actions.refund;
  const button = choice === "transfer" ? `${cur?.label.split(" · ")[0] ?? "다른 날"}로 옮기기` : choice === "keep" ? "이용권 보관하기" : "환불받기";

  const Dot = ({ on }: { on: boolean }) => <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent" : "bg-dot"}`}>{on && CHECK}</span>;

  return (
    <form action={action} className="flex flex-1 flex-col">
      <input type="hidden" name="app_id" value={appId} />
      {choice === "transfer" && slot && <input type="hidden" name="slot_ids" value={slot} />}
      <p className="px-6 pt-6 text-[14px] font-extrabold text-ink2">어떻게 할까요?</p>
      <div className="flex flex-col gap-2 px-4 pt-3" role="radiogroup" aria-label="다음 방법">
        <div className={`rounded-[18px] p-[18px] ${choice === "transfer" ? "bg-accent-soft" : "bg-row"}`}>
          <button type="button" role="radio" aria-checked={choice === "transfer"} disabled={!options.length} onClick={() => setChoice("transfer")} className="flex w-full items-center justify-between text-left disabled:opacity-50">
            <span>
              <span className={`block text-[16px] ${choice === "transfer" ? "font-extrabold text-accent-text" : "font-semibold"}`}>다른 날로 옮기기</span>
              <span className="mt-0.5 block text-[13px] text-muted">{options.length ? "결제는 그대로 이어져요" : "지금 옮길 수 있는 날이 없어요"}</span>
            </span>
            <Dot on={choice === "transfer"} />
          </button>
          {choice === "transfer" && options.length > 0 && (
            <ul className="mt-3.5 flex flex-col gap-1.5" role="radiogroup" aria-label="옮길 날">
              {options.map((o) => {
                const on = o.id === slot;
                return (
                  <li key={o.id}>
                    <button type="button" role="radio" aria-checked={on} onClick={() => setSlot(o.id)} className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-[12px] bg-paper px-[14px] py-2 text-left ${on ? "ring-2 ring-inset ring-accent" : ""}`}>
                      <span className={`text-[15px] ${on ? "font-extrabold" : "font-semibold"}`}>{o.label}</span>
                      <span className={`shrink-0 text-[12px] ${o.hot ? "font-bold text-accent" : "text-muted"}`}>{o.note}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button type="button" role="radio" aria-checked={choice === "keep"} onClick={() => setChoice("keep")} className={`flex min-h-16 items-center justify-between rounded-[18px] px-[18px] py-3 text-left ${choice === "keep" ? "bg-accent-soft" : "bg-row"}`}>
          <span>
            <span className={`block text-[16px] ${choice === "keep" ? "font-extrabold text-accent-text" : "font-semibold"}`}>이용권 보관하기</span>
            <span className="mt-0.5 block text-[13px] text-muted">다음에 원하는 날 쓸 수 있어요</span>
          </span>
          <Dot on={choice === "keep"} />
        </button>
        <button type="button" role="radio" aria-checked={choice === "refund"} onClick={() => setChoice("refund")} className={`flex min-h-16 items-center justify-between rounded-[18px] px-[18px] py-3 text-left ${choice === "refund" ? "bg-accent-soft" : "bg-row"}`}>
          <span>
            <span className={`block text-[16px] ${choice === "refund" ? "font-extrabold text-accent-text" : "font-semibold"}`}>환불받기</span>
            <span className="mt-0.5 block text-[13px] text-muted">결제한 카드로 바로 돌려드려요</span>
          </span>
          <Dot on={choice === "refund"} />
        </button>
      </div>
      <div className="h-32" />
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
        <div className="pb-4">
          <PrimaryButton type="submit" pendingText="처리하는 중">{button}</PrimaryButton>
        </div>
      </div>
    </form>
  );
}
