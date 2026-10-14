"use client";

import { CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";

type Opt = { key: string; label: string; slots: { id: string; region: string }[] };

/** 새 일정(날짜·시간)을 고르고 그 일정의 동네를 고른다. 고른 결과는 slot_ids로 보낸다 */
export function TransferPicker({ options, liked }: { options: Opt[]; liked: string[] }) {
  const [k, setK] = useState(options[0]?.key ?? "");
  const cur = options.find((o) => o.key === k) ?? options[0];
  const [regions, setRegions] = useState<string[]>(() => {
    const pre = (cur?.slots ?? []).filter((s) => liked.includes(s.region)).map((s) => s.region);
    return pre.length ? pre : cur?.slots[0] ? [cur.slots[0].region] : [];
  });
  if (!cur) return null;
  const pick = (key: string) => {
    setK(key);
    const o = options.find((x) => x.key === key)!;
    const pre = o.slots.filter((s) => liked.includes(s.region)).map((s) => s.region);
    setRegions(pre.length ? pre : [o.slots[0].region]);
  };
  const badge = <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 align-middle text-[11px] font-semibold text-accent">필수</span>;
  return (
    <>
      {cur.slots.filter((s) => regions.includes(s.region)).map((s) => <input key={s.id} type="hidden" name="slot_ids" value={s.id} />)}
      <p className="mt-6 text-[15px] font-semibold text-ink">새로운 일정 선택{badge}</p>
      <label className="relative mt-2.5 flex h-[60px] items-center gap-3 rounded-2xl border border-line bg-card px-4">
        <CalendarDays size={22} className="shrink-0 text-accent" />
        <select value={k} onChange={(e) => pick(e.target.value)} className="h-full w-full appearance-none bg-transparent text-[17px] font-semibold text-ink outline-none">
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <ChevronDown size={20} className="pointer-events-none absolute right-4 text-muted" />
      </label>
      <p className="mt-5 text-[15px] font-semibold text-ink">지역 선택{badge}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {cur.slots.map((s) => {
          const on = regions.includes(s.region);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => setRegions((r) => (on ? (r.length > 1 ? r.filter((x) => x !== s.region) : r) : [...r, s.region]))}
              className={`flex h-[56px] items-center gap-2.5 rounded-2xl border px-4 text-[16px] font-semibold transition ${on ? "border-accent bg-accent-soft/60 text-accent ring-1 ring-accent" : "border-line bg-card text-ink"}`}
            >
              <MapPin size={20} className={on ? "fill-accent text-white" : "text-muted"} />
              {s.region}
            </button>
          );
        })}
      </div>
    </>
  );
}
