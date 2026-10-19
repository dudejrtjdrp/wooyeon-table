"use client";

import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeTooltip } from "@/lib/ui-geometry";

/**
 * 처음 보면 모를 말: 점선 밑줄, 마우스를 올리거나(키보드로 가거나) 누르면 풀이가 뜬다. 화면 읽기에는 풀이까지 읽힌다
 * 예: <Term tip="같은 주에 여는 저녁 모임 묶음이에요">회차</Term>
 * 풀이는 body 바로 아래(포털)에 fixed로 띄워서 표 스크롤 상자·카드 겹침에 가리지 않는다
 */
export function Term({ children, tip, inLink }: { children: ReactNode; tip: string; inLink?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; side: "top" | "bottom" } | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const a = ref.current, t = tipRef.current;
    if (!a || !t) return;
    setPos(placeTooltip(a.getBoundingClientRect(), { width: t.offsetWidth, height: t.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

  // 띄운 직후 크기를 재서 자리를 잡는다(그 전엔 안 보이게)
  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", close);
    };
  }, [open, place]);

  return (
    <span
      ref={ref}
      tabIndex={inLink ? undefined : 0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="relative inline-flex cursor-help items-baseline underline decoration-dotted decoration-faint underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
      {/* 화면 읽기용 풀이. sr-only(absolute)는 표 안에서 스크롤 상자를 벗어나 문서 폭을 늘려서, 자리 없는 인라인으로 숨긴다 */}
      <span className="inline-block h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]">: {tip}</span>
      {open &&
        createPortal(
          // 풀이는 위 숨은 글로 이미 읽히므로 말풍선은 화면 읽기에서 뺀다(두 번 읽지 않게)
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            aria-hidden="true"
            data-side={pos?.side}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="term-tip pointer-events-none fixed z-[1000] block w-max max-w-[min(260px,calc(100vw-16px))] rounded-xl px-3 py-2 text-left text-[12px] font-medium leading-relaxed tracking-[-0.02em] text-white shadow-lg"
          >
            {tip}
          </span>,
          document.body,
        )}
    </span>
  );
}
