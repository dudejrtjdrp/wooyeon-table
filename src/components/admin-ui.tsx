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
