import type { ReactNode } from "react";
import { Pill } from "./ui";

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-[16px] font-bold">{title}</h2>}
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

export const ctl = "h-10 rounded-xl border border-line bg-card px-3 text-[14px] outline-none focus:border-accent";
export const btn = "inline-flex h-10 items-center justify-center rounded-xl px-4 text-[14px] font-semibold transition active:scale-[.98]";
export const btnPrimary = `${btn} bg-accent text-white`;
export const btnInk = `${btn} bg-ink text-white`;
export const btnLight = `${btn} border border-line bg-card text-ink hover:bg-paper`;
export const btnDanger = `${btn} bg-danger text-white`;
export const th = "px-4 py-3 text-left text-[12px] font-semibold text-muted";
export const td = "px-4 py-3";

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
    <div className="rounded-2xl bg-card p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`mt-1 text-[26px] font-bold tabular-nums tracking-[-0.02em] ${tone === "danger" ? "text-danger" : tone === "leaf" ? "text-leaf" : ""}`}>{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
