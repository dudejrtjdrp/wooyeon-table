"use client";

import { CalendarDays, ChevronLeft, Eye, EyeOff, Home, MessageSquare, Star, User } from "lucide-react";
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "accent" | "ink" | "light" | "danger" | "outline" | "danger-soft"; pendingText?: string }) {
  const { pending } = useFormStatus();
  const map = {
    accent: "bg-accent text-white",
    ink: "bg-ink text-white",
    light: "bg-field text-ink",
    danger: "bg-danger text-white",
    outline: "bg-accent-soft text-accent-text",
    "danger-soft": "bg-danger/8 text-danger",
  };
  return (
    <button
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`flex h-[56px] w-full items-center justify-center gap-2 rounded-[14px] text-[17px] font-extrabold transition duration-150 active:scale-[.985] disabled:opacity-40 ${map[tone]} ${className}`}
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
      className="flex size-11 items-center justify-center rounded-full text-ink active:bg-field"
    >
      <ChevronLeft size={26} strokeWidth={2} />
    </button>
  );
}

// 하단 탭 4개 (E10): 홈 · 일정 · 단체방 · 내 정보. 알림은 홈 위쪽 종 아이콘으로 들어간다
const TABS = [
  { href: "/", label: "홈", icon: Home, match: (p: string) => p === "/" || p.startsWith("/notifications") },
  { href: "/rounds", label: "일정", icon: CalendarDays, match: (p: string) => p.startsWith("/rounds") },
  { href: "/my-tables", label: "단체방", icon: MessageSquare, match: (p: string) => p.startsWith("/my-tables") },
  { href: "/me", label: "내 정보", icon: User, match: (p: string) => p.startsWith("/me") },
];

export function TabBar({ unread = 0 }: { unread?: number }) {
  const path = usePathname();
  void unread;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-line bg-card">
      <ul className="grid h-[64px] grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] ${on ? "font-extrabold text-accent" : "font-medium text-muted"}`}
              >
                <Icon size={24} strokeWidth={on ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

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
      className={`animate-toast fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 rounded-[14px] px-4 py-3.5 text-center text-[14px] font-bold text-white ${tone === "danger" ? "bg-danger" : "bg-ink/95"}`}
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

/**
 * 입력값이 있는 폼에서 되돌리기 어려운 제출(신고 등)을 한 번 더 확인한다.
 * 처음 누르면 확인 문구와 두 버튼으로 바뀌고, 두 번째에 실제로 보낸다. 폼 값은 그대로 남는다.
 */
export function ConfirmSubmit({ label, question, confirmLabel, tone = "danger-soft" }: { label: string; question: ReactNode; confirmLabel: string; tone?: "danger" | "danger-soft" | "accent" }) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return (
      <PrimaryButton
        type="button"
        tone={tone}
        onClick={(e) => {
          const f = e.currentTarget.form;
          if (f && !f.reportValidity()) return;
          setAsk(true);
        }}
      >
        {label}
      </PrimaryButton>
    );
  }
  return (
    <div role="alertdialog" aria-label={confirmLabel} className="rounded-[16px] bg-field p-4">
      <p className="text-[15px] leading-relaxed text-ink2">{question}</p>
      <div className="mt-3 space-y-2">
        <PrimaryButton type="submit" tone={tone === "danger-soft" ? "danger" : tone} pendingText="보내는 중">{confirmLabel}</PrimaryButton>
        <button type="button" onClick={() => setAsk(false)} className="h-11 w-full text-[15px] font-medium text-muted">다시 볼게요</button>
      </div>
    </div>
  );
}

/** 비밀번호 입력: 눈 모양 버튼으로 보이기·숨기기 */
export function PasswordInput({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={show ? "text" : "password"} className={`${className} pr-14`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
        className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted"
      >
        {show ? <EyeOff size={21} /> : <Eye size={21} />}
      </button>
    </div>
  );
}

/** 별점 (1~5). 값은 숨은 입력으로 보낸다 */
export function StarRating({ name, label, value }: { name: string; label: string; value?: number | null }) {
  const [v, setV] = useState<number>(value ?? 0);
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <span className="text-[16px] text-ink">{label}</span>
      <input type="hidden" name={name} value={v || ""} />
      <span className="-mr-[7px] flex" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n}점`} onClick={() => setV(n)} className="p-[7px] transition active:scale-90">
            <Star size={30} strokeWidth={0} className={n <= v ? "fill-accent" : "fill-dot"} />
          </button>
        ))}
      </span>
    </div>
  );
}

/** 글자 수가 보이는 여러 줄 입력 */
export function CountedTextarea({ max, className = "", defaultValue, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { max: number }) {
  const [n, setN] = useState(String(defaultValue ?? "").length);
  return (
    <div className="relative">
      <textarea {...rest} defaultValue={defaultValue} maxLength={max} onChange={(e) => setN(e.target.value.length)} className={`${className} pb-8`} />
      <span className="pointer-events-none absolute bottom-3 right-4 text-[12px] tabular-nums text-muted">{n}/{max}</span>
    </div>
  );
}

/**
 * 동시에 다른 처리가 먼저 끝나 생긴 오류 밑에 다음 행동을 붙인다.
 * 새로고침은 ?e= 없이 같은 화면을 다시 불러오고, 내 신청 보기는 일정 탭의 내 신청 목록으로 간다.
 */
export function StaleActions() {
  const path = usePathname();
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-4 font-bold">
      <a href={path} className="inline-flex h-11 items-center underline underline-offset-4">새로고침</a>
      <Link href="/rounds" className="inline-flex h-11 items-center underline underline-offset-4">내 신청 보기</Link>
    </span>
  );
}
