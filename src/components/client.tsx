"use client";

import { Bell, CalendarDays, ChevronLeft, Home, User, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

const Spinner = () => (
  <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
);

/** 폼 안에서 누르면 처리 중 표시가 뜨고, 두 번 눌리지 않는 버튼 */
export function PrimaryButton({
  children,
  tone = "accent",
  pendingText,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "accent" | "ink" | "light" | "danger"; pendingText?: string }) {
  const { pending } = useFormStatus();
  const map = {
    accent: "bg-accent text-white",
    ink: "bg-ink text-white",
    light: "border border-line bg-card text-ink",
    danger: "bg-danger text-white",
  };
  return (
    <button
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold transition active:scale-[.985] disabled:opacity-50 ${map[tone]} ${className}`}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingText ?? null}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(href))}
      className="-ml-2 flex size-10 items-center justify-center rounded-full active:bg-line/60"
    >
      <ChevronLeft size={26} strokeWidth={2} />
    </button>
  );
}

const TABS = [
  { href: "/", label: "홈", icon: Home, match: (p: string) => p === "/" },
  { href: "/rounds", label: "일정", icon: CalendarDays, match: (p: string) => p.startsWith("/rounds") },
  { href: "/my-tables", label: "내 식탁", icon: UtensilsCrossed, match: (p: string) => p.startsWith("/my-tables") },
  { href: "/notifications", label: "알림", icon: Bell, match: (p: string) => p.startsWith("/notifications") },
  { href: "/me", label: "내 정보", icon: User, match: (p: string) => p.startsWith("/me") },
];

export function TabBar({ unread = 0 }: { unread?: number }) {
  const path = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? "text-ink" : "text-muted"}`}
              >
                <Icon size={23} strokeWidth={on ? 2.3 : 1.8} />
                {label}
                {href === "/notifications" && unread > 0 && (
                  <span className="absolute left-1/2 top-2 ml-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 화면 위에 잠깐 떴다 사라지는 안내. 주소의 안내용 값은 지워서 새로 고쳐도 다시 뜨지 않게 한다 */
export function Toast({ msg, tone = "ink" }: { msg?: string | null; tone?: "ink" | "danger" }) {
  const [show, setShow] = useState(Boolean(msg));
  useEffect(() => {
    if (!msg) return;
    setShow(true);
    const url = new URL(window.location.href);
    for (const k of ["m", "t", "done"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.toString());
    const id = setTimeout(() => setShow(false), 2800);
    return () => clearTimeout(id);
  }, [msg]);
  if (!msg || !show) return null;
  return (
    <div
      role="status"
      className={`animate-toast fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-[14px] font-medium text-white shadow-lg ${tone === "danger" ? "bg-danger" : "bg-ink"}`}
    >
      {msg}
    </div>
  );
}

/** 되돌리기 어려운 행동 전에 아래에서 올라오는 확인 창 */
export function ConfirmSheet({
  trigger,
  title,
  body,
  confirmLabel,
  action,
  hidden,
  tone = "danger",
}: {
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  action: (form: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  tone?: "danger" | "accent";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <button aria-label="닫기" className="animate-fade absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label={title} className="animate-sheet pb-safe relative w-full max-w-md rounded-t-3xl bg-card px-5 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
            <h2 className="text-[19px] font-bold">{title}</h2>
            <div className="mt-2 text-[15px] leading-relaxed text-muted">{body}</div>
            <form action={action} className="mt-6 space-y-2 pb-5">
              {Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <PrimaryButton tone={tone}>{confirmLabel}</PrimaryButton>
              <button type="button" onClick={() => setOpen(false)} className="h-12 w-full text-[15px] font-medium text-muted">
                그대로 둘게요
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
