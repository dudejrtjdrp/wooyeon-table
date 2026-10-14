import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { now } from "@/lib/clock";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Check } from "lucide-react";
import { BackButton, TabBar } from "./client";

export { ConfirmSheet, CountedTextarea, PasswordInput, PrimaryButton, StarRating, Toast } from "./client";

export const IMG = {
  homeBg: "/images/dining/generated/01-home-background.png",
  restaurantWindow: "/images/dining/generated/02-restaurant-window.png",
  sharedDishes: "/images/dining/generated/03-shared-dishes.png",
  meetingHands: "/images/dining/generated/04-meeting-hands.png",
  placeSetting: "/images/dining/generated/05-place-setting.png",
  neighborhood: "/images/dining/generated/06-neighborhood-evening.png",
  waitingCorner: "/images/dining/generated/07-waiting-corner.png",
  tablePrep: "/images/dining/generated/08-table-preparation.png",
  tableObject: "/images/dining/generated/09-table-object.png",
  softBg: "/images/dining/generated/10-soft-background.png",
  roundTable: "/images/dining/generated/11-round-table-evening.png",
  startTable: "/images/dining/extracted/original-start-table.png",
  tableRestaurant: "/images/dining/extracted/original-table-restaurant.png",
  scheduleRestaurant: "/images/dining/extracted/original-schedule-restaurant.png",
  profileRestaurant: "/images/dining/extracted/original-profile-restaurant.png",
  homePhotoRight: "/images/dining/extracted/original-home-photo-right.png",
  splashTable: "/images/dining/extracted/original-splash-table.png",
} as const;

/** 사진. 잘리면 안 되는 부분은 position으로 맞춘다 */
export function Photo({
  src,
  alt = "",
  className = "",
  position = "center",
  contain,
  priority,
  sizes = "(max-width: 448px) 100vw, 448px",
}: {
  src: string;
  alt?: string;
  className?: string;
  position?: string;
  contain?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={contain ? "object-contain" : "object-cover"} style={{ objectPosition: position }} />
    </div>
  );
}

/** 화면 위쪽에 깔리는 은은한 사진 바탕. 아래로 갈수록 바탕색에 녹아든다 */
export function Backdrop({ src = IMG.softBg, height = 360, position = "right top", side }: { src?: string; height?: number; position?: string; side?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-0 -z-0 ${side ? "right-0 w-[62%]" : "inset-x-0"}`}
      style={{
        height,
        maskImage: side ? "radial-gradient(120% 100% at 100% 0%, #000 40%, transparent 78%)" : "linear-gradient(#000 45%, transparent)",
        WebkitMaskImage: side ? "radial-gradient(120% 100% at 100% 0%, #000 40%, transparent 78%)" : "linear-gradient(#000 45%, transparent)",
      }}
    >
      <Image src={src} alt="" fill sizes="448px" priority className="object-cover" style={{ objectPosition: position }} />
    </div>
  );
}

/** 탭 화면 맨 위 "우연한 식탁"과 짧은 선 */
export function Brandline() {
  return (
    <div className="pt-safe">
      <p className="pt-5 text-[17px] font-semibold tracking-[-0.01em] text-ink">우연한 식탁</p>
      <span className="mt-3 block h-[2px] w-5 rounded-full bg-accent/40" />
    </div>
  );
}

/** 큰 제목. 둘째 줄은 블루로 강조한다 */
export function PageTitle({ title, accent, sub, className = "" }: { title?: ReactNode; accent?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <h1 className="text-[28px] font-bold leading-[1.28] tracking-[-0.03em] text-ink">
        {title}
        {title && accent ? <br /> : null}
        {accent && <span className="text-accent">{accent}</span>}
      </h1>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function Required() {
  return <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 align-middle text-[11px] font-semibold text-accent">필수</span>;
}
export function Optional() {
  return <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-line/70 px-2 align-middle text-[11px] font-semibold text-muted">선택</span>;
}

/** 흰 카드 한 덩어리: 제목 + 필수/선택 + 설명 + 내용 */
export function SectionCard({
  title,
  required,
  optional,
  hint,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`shadow-card rounded-[22px] bg-card p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">
              {title}
              {required && <Required />}
              {optional && <Optional />}
            </h2>
          )}
          {right}
        </div>
      )}
      {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{hint}</p>}
      {children && <div className={title || hint ? "mt-4" : ""}>{children}</div>}
    </section>
  );
}

/** 하위 화면: 뒤로 가기와 왼쪽 제목, 아래 고정 버튼 */
export function Screen({
  title,
  back,
  right,
  children,
  footer,
  backdrop,
}: {
  title?: string;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 위쪽 사진 바탕 (기본: 은은한 빛 바탕) */
  backdrop?: ReactNode | false;
}) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-x-hidden bg-paper">
      {backdrop === false ? null : backdrop ?? <Backdrop side height={300} />}
      {(title || back) && (
        <header className="pt-safe sticky top-0 z-20">
          <div className="flex h-14 items-center gap-1 px-3">
            {back && <BackButton href={back} />}
            {title && <h1 className="min-w-0 flex-1 truncate text-[18px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>}
            <div className="ml-auto flex justify-end">{right}</div>
          </div>
        </header>
      )}
      <main className={`relative z-10 flex-1 px-5 ${footer ? "pb-32" : "pb-10"}`}>{children}</main>
      {footer && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper/95 to-paper/0 px-5 pt-6">
          <div className="pb-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

/** 하단 탭이 있는 첫 화면들(홈·일정·내 식탁·알림·내 정보) */
export async function TabScreen({ title, sub, right, children, backdrop, brand = true }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; backdrop?: ReactNode | false; brand?: boolean }) {
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
    <div className="relative mx-auto min-h-dvh max-w-md overflow-x-hidden bg-paper pb-28">
      {backdrop === false ? null : backdrop ?? <Backdrop side height={320} />}
      <main className="relative z-10 px-5">
        {brand && <Brandline />}
        {title && (
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-[30px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
              {sub && <p className="mt-2 text-[15px] text-muted">{sub}</p>}
            </div>
            {right}
          </div>
        )}
        {children}
      </main>
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
  tone?: "accent" | "ink" | "light" | "dark" | "outline";
  className?: string;
}) {
  const map = {
    accent: "bg-accent text-white shadow-cta",
    dark: "bg-accent text-white shadow-cta",
    ink: "bg-ink text-white",
    light: "border border-line bg-card text-ink",
    outline: "border-[1.5px] border-accent bg-card text-accent",
  };
  return (
    <Link
      href={href}
      className={`flex h-[56px] w-full items-center justify-center gap-1.5 rounded-2xl text-[17px] font-semibold tracking-[-0.01em] transition active:scale-[.985] ${map[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, required, optional, children }: { label: string; hint?: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[15px] font-bold text-ink">{label}</span>
      {required && <Required />}
      {optional && <Optional />}
      {hint && <span className="ml-1.5 text-[13px] text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputCls =
  "h-[54px] w-full rounded-2xl border border-[#e8edf5] bg-field px-4 text-[16px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent focus:bg-card focus:ring-4 focus:ring-accent/10";

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
          <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-[15px] text-ink transition duration-150 peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 [&>svg]:hidden peer-checked:[&>svg]:block">
            {o}
            <Check size={16} strokeWidth={2.6} />
          </span>
        </label>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shadow-card rounded-[22px] bg-card p-5 ${className}`}>{children}</div>;
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
  return <div className={`shadow-card divide-y divide-line overflow-hidden rounded-[22px] bg-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-9 flex items-end justify-between">
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{children}</h2>
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
    muted: "bg-[#eef1f6] text-muted",
    accent: "bg-accent-soft text-accent",
    leaf: "bg-leaf/10 text-leaf",
    ink: "bg-ink text-white",
    candle: "bg-candle/20 text-[#8a5a00]",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[13px] font-semibold ${map[tone]}`}>{children}</span>;
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
