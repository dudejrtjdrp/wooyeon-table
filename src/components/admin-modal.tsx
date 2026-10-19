"use client";

import { X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary';

/**
 * 어드민 공통 모달(브라우저 기본 <dialog>). 화면에 늘 둘 필요 없는 '추가·만들기' 폼을 넣는다.
 * - 열면 첫 입력칸으로, 닫으면 연 버튼으로 초점이 돌아간다. Tab은 모달 안에서만 돈다
 * - Esc, 바깥(어두운 곳) 누르기, 닫기 버튼으로 닫는다
 * - 폼을 보내고 주소가 바뀌면(서버 액션이 ?m=·?e= 를 붙여 돌려보내면) 저절로 닫혀 결과 알림이 보인다
 * - 휴대폰 폭에서는 아래에서 올라오는 시트로 뜬다
 * - hash: 주소가 #이 값이면 처음부터 열어 둔다(다른 화면에서 바로 열기)
 */
export function AdminModal({
  label,
  title,
  desc,
  children,
  triggerClassName,
  icon,
  hash,
  wide,
}: {
  label: ReactNode;
  title: string;
  desc?: ReactNode;
  children: ReactNode;
  triggerClassName: string;
  icon?: ReactNode;
  hash?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const sp = useSearchParams();
  const where = `${path}?${sp.toString()}`;
  const first = useRef(where);

  const show = useCallback(() => {
    const d = ref.current;
    if (!d || d.open) return;
    // 연 버튼(또는 그때 초점이 있던 곳). 해시로 바로 열렸으면 연 버튼으로
    const a = document.activeElement as HTMLElement | null;
    opener.current = a && a !== document.body ? a : trigger.current;
    d.showModal();
    setOpen(true);
    // 첫 입력칸에 초점 (없으면 닫기 버튼)
    const f = d.querySelector("[data-modal-body]")?.querySelector<HTMLElement>(FOCUSABLE);
    (f ?? d.querySelector<HTMLElement>("[data-modal-close]"))?.focus();
  }, []);
  const close = useCallback(() => ref.current?.close(), []);

  // 주소가 바뀌면 닫는다 (저장 뒤 결과 알림이 모달에 가리지 않게)
  useEffect(() => {
    if (where !== first.current) {
      first.current = where;
      close();
    }
  }, [where, close]);

  useEffect(() => {
    if (hash && typeof window !== "undefined" && window.location.hash === `#${hash}`) show();
  }, [hash, show]);

  return (
    <>
      <button ref={trigger} type="button" className={triggerClassName} onClick={show} aria-haspopup="dialog" aria-expanded={open}>
        {icon}
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={desc ? descId : undefined}
        onClose={() => {
          setOpen(false);
          // 연 버튼으로 초점을 돌려준다
          // 바깥을 눌러 닫을 때 브라우저가 초점을 body로 옮기는 것보다 늦게 돌려준다
          const el = opener.current?.isConnected ? opener.current : trigger.current;
          requestAnimationFrame(() => setTimeout(() => el?.focus?.(), 0));
        }}
        onClick={(e) => {
          // 바깥(::backdrop)을 누르면 dialog 자신이 눌린다
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
          if (!items.length) return;
          const a = items[0];
          const z = items[items.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }}
        className={`admin-modal m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[24px] bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-h-[86dvh] sm:rounded-[24px] ${wide ? "sm:max-w-[760px]" : "sm:max-w-[560px]"} sm:w-[calc(100%-48px)]`}
      >
        {/* 닫힌 동안에는 안의 폼을 그리지 않아도 되지만, 입력하던 값이 남게 그대로 둔다 */}
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-5 sm:px-6">
            <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden" />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[19px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
              {desc && <p id={descId} className="mt-1 text-[13px] leading-relaxed text-muted">{desc}</p>}
            </div>
            <button type="button" data-modal-close onClick={close} aria-label="닫기" className="-mr-1.5 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-field hover:text-ink">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}
