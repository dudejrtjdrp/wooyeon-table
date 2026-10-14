import Link from "next/link";
import type { ReactNode } from "react";
import { now } from "@/lib/clock";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { BackButton, TabBar } from "./client";

export { ConfirmSheet, PrimaryButton, Toast } from "./client";

/** 하위 화면: 뒤로 가기와 가운데 제목, 아래 고정 버튼 */
export function Screen({
  title,
  back,
  right,
  children,
  footer,
}: {
  title?: string;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      {(title || back) && (
        <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur">
          <div className="grid h-14 grid-cols-[48px_1fr_48px] items-center px-3">
            <div>{back && <BackButton href={back} />}</div>
            {title && <h1 className="truncate text-center text-[17px] font-semibold">{title}</h1>}
            <div className="flex justify-end">{right}</div>
          </div>
        </header>
      )}
      <main className={`flex-1 px-5 ${footer ? "pb-28" : "pb-10"}`}>{children}</main>
      {footer && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

/** 하단 탭이 있는 첫 화면들(홈·일정·내 식탁·알림·내 정보) */
export async function TabScreen({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const s = await getSession();
  let unread = 0;
  if (s) {
    const { count } = await db()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", s.uid)
      .is("read_at", null)
      .lte("scheduled_at", (await now()).toISOString());
    unread = count ?? 0;
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-paper pb-24">
      {title && (
        <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-5">
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
            {right}
          </div>
        </header>
      )}
      <main className="px-5">{children}</main>
      <TabBar unread={unread} />
    </div>
  );
}

export function LinkButton({
  href,
  children,
  tone = "accent",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "accent" | "ink" | "light" | "dark";
  className?: string;
}) {
  const map = {
    accent: "bg-accent text-white",
    dark: "bg-accent text-white",
    ink: "bg-ink text-white",
    light: "border border-line bg-card text-ink",
  };
  return (
    <Link
      href={href}
      className={`flex h-[54px] w-full items-center justify-center rounded-2xl text-[16px] font-semibold transition active:scale-[.985] ${map[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold">{label}</span>
      {hint && <span className="ml-1.5 text-[13px] text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputCls =
  "h-[52px] w-full rounded-2xl border border-line bg-card px-4 text-[16px] outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/10";

/** 여러 개 고르는 칩. JS 없이 체크박스로 동작한다 */
export function Chips({
  name,
  options,
  selected = [],
  type = "checkbox",
  required,
}: {
  name: string;
  options: readonly string[];
  selected?: string[];
  type?: "checkbox" | "radio";
  required?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <label key={o} className="cursor-pointer">
          <input
            type={type}
            name={name}
            value={o}
            defaultChecked={selected.includes(o)}
            required={required && type === "radio" && i === 0}
            className="peer sr-only"
          />
          <span className="inline-block rounded-full border border-line bg-card px-4 py-2.5 text-[15px] transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            {o}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-card p-5 ${className}`}>{children}</div>;
}

/** 목록 한 줄. 카드 대신 줄로 묶어 정보 밀도를 높인다 */
export function Row({ href, children, right }: { href?: string; children: ReactNode; right?: ReactNode }) {
  const inner = (
    <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">{children}</div>
      {right}
    </div>
  );
  return href ? (
    <Link href={href} className="block active:bg-paper">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-line overflow-hidden rounded-3xl bg-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between">
      <h2 className="text-[17px] font-bold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

export function ErrorText({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">
      {msg}
    </p>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "leaf" | "ink" | "candle" | "danger" }) {
  const map = {
    muted: "bg-paper text-muted",
    accent: "bg-accent-soft text-accent",
    leaf: "bg-leaf/10 text-leaf",
    ink: "bg-ink text-white",
    candle: "bg-candle/20 text-[#8a5a00]",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${map[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon}
      <p className="mt-4 text-[17px] font-semibold">{title}</p>
      {body && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}
