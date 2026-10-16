"use client";

import { useState } from "react";
import { ConfirmSubmit, PrimaryButton } from "@/components/client";

type Opt = { id: string; label: string; note: string; tag: string; hot?: boolean };
type Act = (f: FormData) => void | Promise<void>;
type Choice = "join" | "move" | "wait" | "keep" | "refund";

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

const Dot = ({ on }: { on: boolean }) => <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent" : "bg-dot"}`}>{on && CHECK}</span>;

/** 태그: 고른 동네는 초록, 옆 동네는 연한 초록, 조금 멀어요는 회색 */
const Tag = ({ t }: { t: string }) => (
  <span className={`inline-flex h-6 shrink-0 items-center rounded-[12px] px-2 text-[12px] font-bold ${t === "고른 동네" ? "bg-accent text-white" : t === "옆 동네" ? "bg-[#CFE3D8] text-accent-text" : "bg-[#EEF1EF] text-ink2"}`}>{t}</span>
);


function OptList({ items, value, onPick, label }: { items: Opt[]; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <ul className="mt-3.5 flex flex-col gap-1.5" role="radiogroup" aria-label={label}>
      {items.map((o) => {
        const on = o.id === value;
        return (
          <li key={o.id}>
            <button type="button" role="radio" aria-checked={on} onClick={() => onPick(o.id)} className={`flex min-h-14 w-full items-center gap-2.5 rounded-[12px] bg-paper px-[14px] py-2.5 text-left ${on ? "ring-2 ring-inset ring-accent" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] ${on ? "font-extrabold" : "font-semibold"}`}>{o.label}</span>
                <span className={`mt-0.5 block text-[12px] ${o.hot ? "font-bold text-accent" : "text-faint"}`}>{o.note}</span>
              </span>
              <Tag t={o.tag} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ChoiceRow({ on, onPick, title, sub, disabled, children }: { on: boolean; onPick: () => void; title: string; sub: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`rounded-[18px] p-[18px] ${on ? "bg-accent-soft" : "bg-row"}`}>
      <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onPick} className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-50">
        <span>
          <span className={`block text-[16px] ${on ? "font-extrabold text-accent-text" : "font-semibold"}`}>{title}</span>
          <span className={`mt-0.5 block text-[13px] ${on ? "text-ink2" : "text-faint"}`}>{sub}</span>
        </span>
        <Dot on={on} />
      </button>
      {on && children}
    </div>
  );
}

/**
 * 실패했을 때 고를 수 있는 방법. 고른 것에 따라 아래 버튼이 바뀐다.
 * 순서: 바로 앉을 자리 → 다른 일정 → 기다리기 → 이용권 보관 → 환불
 */
export function ResolveChoice({ appId, joins, moves, waitUntil, nearOk, membership, actions }: {
  appId: string;
  nearOk: boolean;
  membership: boolean;
  joins: Opt[];
  moves: Opt[];
  waitUntil: string | null;
  actions: { join: Act; transfer: Act; wait: Act; keepPass: Act; refund: Act };
}) {
  const first: Choice = joins.length ? "join" : moves.length ? "move" : waitUntil ? "wait" : "keep";
  const [choice, setChoice] = useState<Choice>(first);
  const [table, setTable] = useState(joins[0]?.id ?? "");
  const [slot, setSlot] = useState(moves[0]?.id ?? "");
  const curJoin = joins.find((o) => o.id === table);
  const curMove = moves.find((o) => o.id === slot);
  const action = { join: actions.join, move: actions.transfer, wait: actions.wait, keep: actions.keepPass, refund: actions.refund }[choice];
  const short = (o?: Opt) => o?.label.split(" · ")[0].replace(/ (오전|오후|저녁|낮|새벽|밤) .*$/, "") ?? "";
  const button = {
    join: `${short(curJoin)} 테이블에 앉기`,
    move: `${short(curMove)} 일정으로 옮기기`,
    wait: "자리 나면 알려 주세요",
    keep: membership ? "이번엔 넘기기" : "이용권 보관하기",
    refund: "환불받기",
  }[choice];

  return (
    <form action={action} className="flex flex-1 flex-col">
      <input type="hidden" name="app_id" value={appId} />
      {choice === "join" && table && <input type="hidden" name="table_id" value={table} />}
      {choice === "move" && slot && <input type="hidden" name="slot_ids" value={slot} />}
      <p className="px-6 pt-6 text-[14px] font-extrabold text-ink2">어떻게 할까요?</p>
      <div className="flex flex-col gap-2 px-4 pt-3" role="radiogroup" aria-label="다음 방법">
        {joins.length > 0 && (
          <ChoiceRow on={choice === "join"} onPick={() => setChoice("join")} title="빈자리에 바로 앉기" sub="이미 모인 테이블에 자리가 있어요. 바로 확정돼요">
            <OptList items={joins} value={table} onPick={setTable} label="앉을 테이블" />
          </ChoiceRow>
        )}
        <ChoiceRow on={choice === "move"} onPick={() => setChoice("move")} title="다른 일정으로 옮기기" sub={moves.length ? "결제는 그대로, 그 일정 마감 때 다시 매칭해요" : "지금 옮길 수 있는 일정이 없어요"} disabled={!moves.length}>
          <OptList items={moves} value={slot} onPick={setSlot} label="옮길 일정" />
        </ChoiceRow>
        {waitUntil && <ChoiceRow on={choice === "wait"} onPick={() => setChoice("wait")} title="자리 나면 알려 주기" sub={`${waitUntil}까지 ${nearOk ? "고른 동네나 같은 날 옆 동네" : "고른 동네·날짜"}에 자리가 나면 먼저 여쭤볼게요`} />}
        {membership ? (
          <ChoiceRow on={choice === "keep"} onPick={() => setChoice("keep")} title="이번엔 넘기기" sub="멤버십 기간을 7일 늘려 드렸어요. 다른 일정은 언제든 신청할 수 있어요" />
        ) : (
          <>
            <ChoiceRow on={choice === "keep"} onPick={() => setChoice("keep")} title="이용권 보관하기" sub="다음에 원하는 일정에 바로 쓸 수 있어요" />
            <ChoiceRow on={choice === "refund"} onPick={() => setChoice("refund")} title="환불받기" sub="결제한 수단으로 바로 돌려드려요" />
          </>
        )}
      </div>
      {!joins.length && !moves.length && (
        <p className="px-6 pt-4 text-[13px] leading-relaxed text-muted">{membership ? "새 일정이 열리면 일정 탭에서 멤버십으로 바로 신청할 수 있어요." : "새 일정이 열리면 일정 탭에서 보관한 이용권으로 바로 신청할 수 있어요."}</p>
      )}
      <div className="h-32" />
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
        <div className="pb-4">
          {choice === "refund" ? (
            <ConfirmSubmit key="refund" tone="accent" label={button} question="환불하면 이번 신청이 끝나고 되돌릴 수 없어요. 결제한 수단으로 바로 돌려드려요." confirmLabel="환불받기" />
          ) : (
            <PrimaryButton type="submit" pendingText="처리하는 중">{button}</PrimaryButton>
          )}
        </div>
      </div>
    </form>
  );
}
