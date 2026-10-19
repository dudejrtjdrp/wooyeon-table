"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/** 테이블 카드(<details data-mt>)를 한 번에 펼치거나 접는다 */
export function ExpandAll() {
  const set = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>("details[data-mt]").forEach((d) => (d.open = open));
  const b = "inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft";
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => set(true)} className={b}><ChevronsUpDown size={15} aria-hidden="true" />모두 펼치기</button>
      <button type="button" onClick={() => set(false)} className={b}><ChevronsDownUp size={15} aria-hidden="true" />모두 접기</button>
    </span>
  );
}
