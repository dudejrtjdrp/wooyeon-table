import type { NextStep } from "@/lib/next-step";

/** 다음에 일어날 일(그 시각)과 지금 할 수 있는 일. 홈 카드와 신청 상세가 같이 쓴다 */
export function NextStepBox({ s, className = "" }: { s: NextStep; className?: string }) {
  return (
    <div className={`rounded-[14px] bg-paper px-4 py-3.5 text-[14px] leading-relaxed ${className}`} aria-label="다음 일정">
      {s.next && (
        <>
          <p className="text-[12px] font-bold text-accent-text">다음에 일어날 일</p>
          <p className="mt-0.5 text-ink2">{s.next.when && <b className="font-bold text-ink">{s.next.when}</b>}{s.next.text}</p>
        </>
      )}
      <p className={`${s.next ? "mt-2.5" : ""} text-[12px] font-bold text-muted`}>지금 할 수 있는 일</p>
      <p className="mt-0.5 text-ink2">{s.can}</p>
    </div>
  );
}
