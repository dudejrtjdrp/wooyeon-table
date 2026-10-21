"use client";

import { MessagesSquare, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 모임 중에만 보이는 '지금 테이블에서' 카드(대화 주제·아이스브레이킹).
 * 체크인한 뒤(=자리에 앉은 뒤) 처음 열 때 한 번 크게 띄운다. 시작 알림을 눌러 왔으면(force) 바로 띄운다.
 * 본 기록은 이 기기에만 남긴다(못 읽어도 카드는 그대로 보인다)
 */
export function NowAtTable({ tableId, topics, icebreakers, autoOpen, force }: { tableId: string; topics: string[]; icebreakers: string[]; autoOpen: boolean; force: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoOpen && !force) return;
    const key = `now-seen:${tableId}`;
    let seen = false;
    try {
      seen = window.localStorage.getItem(key) === "1";
      window.localStorage.setItem(key, "1");
    } catch {
      // 저장소를 못 쓰면 알림으로 들어왔을 때만 띄운다
    }
    if (force || !seen) setOpen(true);
  }, [tableId, autoOpen, force]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (!topics.length && !icebreakers.length) return null;
  return (
    <>
      <section className="mt-6 rounded-[18px] bg-accent-soft p-5" aria-labelledby="now-title">
        <div className="flex items-center gap-2 text-accent-text">
          <MessagesSquare size={18} aria-hidden="true" />
          <h2 id="now-title" className="text-[17px] font-bold">지금 테이블에서</h2>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">휴대폰은 잠시 내려놓고, 마주 앉은 분들과 이야기해 보세요.</p>
        <Lists topics={topics} icebreakers={icebreakers} />
        <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex h-11 items-center text-[14px] font-bold text-accent-text underline underline-offset-4">크게 보기</button>
      </section>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <button aria-label="닫기" className="animate-fade absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="now-sheet-title" className="animate-sheet pb-safe relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card px-5 pt-3">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-muted"><X size={20} /></button>
            <p className="text-[13px] font-semibold text-accent-text">모임이 시작됐어요</p>
            <h2 id="now-sheet-title" className="mt-1 text-[21px] font-bold leading-snug">오늘 테이블에서<br />나눠 볼 이야기</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">채팅으로 답하지 않아도 돼요. 한 분씩 돌아가며 이야기해 보세요.</p>
            <Lists topics={topics} icebreakers={icebreakers} big />
            <div className="pb-5 pt-5">
              <button type="button" onClick={() => setOpen(false)} className="h-[52px] w-full rounded-[14px] bg-accent text-[16px] font-extrabold text-white active:scale-[.985]">테이블로 돌아가기</button>
              <p className="mt-2 text-center text-[12px] text-muted">모임 정보의 &lsquo;지금 테이블에서&rsquo;에서 다시 볼 수 있어요.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Lists({ topics, icebreakers, big }: { topics: string[]; icebreakers: string[]; big?: boolean }) {
  const txt = big ? "text-[16px]" : "text-[15px]";
  return (
    <>
      {topics.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-bold text-muted">대화 주제</h3>
          <ol className="mt-1.5 space-y-2">
            {topics.map((x, i) => (
              <li key={x} className={`flex gap-2.5 ${txt} leading-relaxed text-ink`}>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${big ? "bg-accent-soft" : "bg-card"} text-[12px] font-bold text-accent-text`} aria-hidden="true">{i + 1}</span>
                <span className="min-w-0">{x}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {icebreakers.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-bold text-muted">아이스브레이킹 게임</h3>
          <ul className="mt-1.5 space-y-2">
            {icebreakers.map((x) => (
              <li key={x} className={`rounded-[12px] ${big ? "bg-paper" : "bg-card"} px-3.5 py-2.5 ${txt} leading-relaxed text-ink`}>{x}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
