"use client";

import { useState, useTransition } from "react";

/**
 * 켜기·끄기 스위치. 누르면 화면을 새로 그리지 않고 스위치가 바로 움직이고, 저장은 뒤에서 한다.
 * 저장이 실패하면 원래 상태로 되돌린다. action은 inline=1이면 페이지를 옮기지 않는 서버 액션
 */
export function SwitchForm({ action, fields, on: initial, onLabel, offLabel, label, title }: {
  action: (f: FormData) => Promise<unknown>;
  fields: Record<string, string>;
  on: boolean;
  onLabel: string;
  offLabel: string;
  label: string;
  title?: string;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    f.set("active", String(next));
    f.set("inline", "1");
    start(async () => {
      try {
        await action(f);
      } catch {
        setOn(!next);
      }
    });
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      aria-busy={pending}
      onClick={flip}
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-[13px] font-semibold text-muted hover:bg-field"
    >
      <span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition-colors duration-200 ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-200 ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={`w-14 text-left ${on ? "text-accent-text" : ""}`}>{on ? onLabel : offLabel}</span>
    </button>
  );
}
