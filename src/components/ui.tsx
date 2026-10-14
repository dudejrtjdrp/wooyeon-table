import Link from "next/link";
import type { ReactNode } from "react";

export function Screen({
  title,
  back,
  children,
  footer,
}: {
  title?: string;
  back?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      {(title || back) && (
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-paper/90 px-4 backdrop-blur">
          {back && (
            <Link href={back} aria-label="뒤로" className="-ml-2 rounded-full p-2 text-xl leading-none">
              ←
            </Link>
          )}
          {title && <h1 className="text-[17px] font-semibold">{title}</h1>}
        </header>
      )}
      <main className="flex-1 px-5 pb-8">{children}</main>
      {footer && (
        <div className="sticky bottom-0 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur">{footer}</div>
      )}
    </div>
  );
}

export function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`h-13 w-full rounded-xl bg-ink py-3.5 text-[16px] font-semibold text-white transition active:scale-[.99] disabled:opacity-40 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, tone = "dark" }: { href: string; children: ReactNode; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={`block w-full rounded-xl py-3.5 text-center text-[16px] font-semibold ${
        tone === "dark" ? "bg-ink text-white" : "border border-line bg-card text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[14px] font-medium">{label}</span>
      {hint && <span className="ml-1.5 text-[12px] text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-card px-4 py-3 text-[16px] outline-none placeholder:text-muted/70 focus:border-ink";

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
          <span className="inline-block rounded-full border border-line bg-card px-3.5 py-2 text-[14px] transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            {o}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card p-5 ${className}`}>{children}</div>;
}

export function ErrorText({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return <p className="rounded-lg bg-accent/10 px-3 py-2 text-[14px] text-accent">{msg}</p>;
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "leaf" | "ink" }) {
  const map = {
    muted: "bg-line/60 text-muted",
    accent: "bg-accent/10 text-accent",
    leaf: "bg-leaf/10 text-leaf",
    ink: "bg-ink text-white",
  };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-medium ${map[tone]}`}>{children}</span>;
}
