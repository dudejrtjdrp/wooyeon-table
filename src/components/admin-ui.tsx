import type { ReactNode } from "react";
import { Pill } from "./ui";
import { btnLight, ctl } from "./admin-classes";
export { btn, btnDanger, btnInk, btnLight, btnPrimary, ctl, table, td, tdNowrap, tdText, th } from "./admin-classes";
// 풀이 말풍선은 포털로 띄우는 클라이언트 컴포넌트. 서버 화면에서도 그대로 <Term>으로 쓴다
export { Term } from "./term";
export { TableScroll } from "./table-scroll";

/**
 * 화면 머리. how: 처음 온 운영자를 위한 '여기서 하는 일' 2~4단계(짧은 동사구). 제목 아래 한 줄 띠로 보인다
 */
export function PageHeader({ title, desc, actions, how }: { title: string; desc?: ReactNode; actions?: ReactNode; how?: ReactNode[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
          {desc && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{desc}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {how && how.length > 0 && <HowTo steps={how} />}
    </div>
  );
}

/** '여기서 하는 일' 띠: ① 회차 만들기 → ② 마감 기다리기 → ③ 결과 확인 */
export function HowTo({ steps }: { steps: ReactNode[] }) {
  return (
    <ol aria-label="여기서 하는 일" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl bg-accent-soft/50 px-4 py-2.5 text-[13px] text-ink2">
      <li className="mr-1 font-bold text-accent-text">여기서 하는 일</li>
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true" className="text-faint">→</span>}
          <span className="flex size-5 items-center justify-center rounded-full bg-card text-[11px] font-bold text-accent">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
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
