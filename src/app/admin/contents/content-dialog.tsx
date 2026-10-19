"use client";

import { X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";

/**
 * 콘텐츠 추가·고치기 창. 공통 모달은 다른 브랜치에서 만드는 중이라 이 화면 안에서만 쓰는 간단한 <dialog>다.
 * 바깥(어두운 곳)을 누르거나 Esc, 닫기 버튼으로 닫는다. 저장을 누르면 닫히고 결과는 오른쪽 아래 알림으로 뜬다
 */
export function ContentDialog({ label, title, desc, triggerClass, triggerLabel, children }: { label: ReactNode; title: string; desc?: ReactNode; triggerClass: string; triggerLabel?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className={triggerClass} aria-label={triggerLabel} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${id}-t`}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        onSubmit={() => ref.current?.close()}
        className="m-auto max-h-[calc(100dvh-24px)] w-[min(600px,calc(100vw-24px))] overflow-hidden rounded-[20px] bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/45"
      >
        <div className="flex max-h-[calc(100dvh-24px)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={`${id}-t`} className="text-[18px] font-bold tracking-[-0.02em]">{title}</h2>
              {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{desc}</p>}
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="닫기" className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-field hover:text-ink">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
