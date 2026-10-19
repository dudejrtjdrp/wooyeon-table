import type { ReactNode } from "react";
import { Pill } from "./ui";
import { btnLight, ctl } from "./admin-classes";
export { btn, btnDanger, btnInk, btnLight, btnPrimary, ctl, td, th } from "./admin-classes";

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`shadow-card rounded-[20px] bg-card p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ v }: { v: [string, "muted" | "accent" | "leaf" | "ink" | "candle" | "danger"] }) {
  return <Pill tone={v[1]}>{v[0]}</Pill>;
}


/** 회차 고르기 (주소의 r 값으로 넘긴다) */
export function RoundPicker({ rounds, current, extra }: { rounds: { id: string; title: string }[]; current?: string; extra?: React.ReactNode }) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <select name="r" defaultValue={current} className={ctl}>
        {rounds.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
      {extra}
      <button className={btnLight}>보기</button>
    </form>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "danger" | "leaf" }) {
  return (
    <div className="shadow-card rounded-[20px] bg-card p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`mt-1 text-[30px] font-bold tabular-nums tracking-[-0.03em] ${tone === "danger" ? "text-danger" : tone === "leaf" ? "text-leaf" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
