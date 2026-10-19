"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { scrollState } from "@/lib/ui-geometry";

/**
 * 어드민 표 가로 스크롤 상자. 표가 실제로 옆으로 넘칠 때만 '옆으로 밀어서 더 보기'와 오른쪽 그림자를 보여 준다.
 * 넘칠 때는 상자에 키보드로 들어가 ←→로 넘길 수 있다. className은 바깥 카드(여백·둥근 모서리·바탕)에 붙는다
 */
export function TableScroll({ children, className = "shadow-card rounded-[20px] bg-card", label = "표" }: { children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState({ overflow: false, more: false, scrolled: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const n = scrollState(el);
      setS((o) => (o.overflow === n.overflow && o.more === n.more && o.scrolled === n.scrolled ? o : n));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {s.overflow && (
        <p data-scroll-hint className="flex items-center justify-end gap-1 px-4 pt-2.5 text-[12px] font-medium text-muted" aria-hidden="true">
          옆으로 밀어서 더 보기 <ChevronRight size={14} />
        </p>
      )}
      <div
        ref={ref}
        tabIndex={s.overflow ? 0 : undefined}
        role={s.overflow ? "region" : undefined}
        aria-label={s.overflow ? `${label}, 옆으로 밀어서 더 볼 수 있어요` : undefined}
        className="overflow-x-auto px-2 pb-2 focus-visible:outline-offset-[-2px]"
      >
        {children}
      </div>
      {/* 가장자리 그림자: 더 있는 쪽에만 */}
      <div aria-hidden="true" className={`table-fade-l pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity ${s.scrolled ? "opacity-100" : "opacity-0"}`} />
      <div aria-hidden="true" className={`table-fade-r pointer-events-none absolute inset-y-0 right-0 w-10 transition-opacity ${s.more ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}
