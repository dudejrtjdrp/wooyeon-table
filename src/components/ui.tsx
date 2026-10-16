import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { now } from "@/lib/clock";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { Bell } from "lucide-react";
import { BackButton, StaleActions, TabBar } from "./client";

export { ConfirmSheet, ConfirmSubmit, CountedTextarea, PasswordInput, PrimaryButton, StarRating, Toast } from "./client";

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

/** E안은 사진 바탕을 쓰지 않는다. 예전 화면 호환용으로 아무것도 그리지 않는다 */
export function Backdrop(_: { src?: string; height?: number; position?: string; side?: boolean }) {
  void _;
  return null;
}

/** 탭 화면 맨 위 "우연한 식탁"과 짧은 선 */
export function Brandline() {
  return (
    <div className="pt-safe">
      <p className="flex h-14 items-center text-[17px] font-black text-accent">우연한 식탁</p>
    </div>
  );
}

/** 큰 제목. 둘째 줄은 블루로 강조한다 */
export function PageTitle({ title, accent, sub, className = "" }: { title?: ReactNode; accent?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <h1 className="text-[26px] font-extrabold leading-[1.38] text-ink">
        {title}
        {title && accent ? <br /> : null}
        {accent}
      </h1>
      {sub && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function Required() {
  return <span className="ml-1.5 align-middle text-[12px] font-bold text-accent">필수</span>;
}
export function Optional() {
  return <span className="ml-1.5 align-middle text-[12px] font-medium text-faint">선택</span>;
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
    <section className={`py-3 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[15px] font-extrabold text-ink2">
              {title}
              {required && <Required />}
              {optional && <Optional />}
            </h2>
          )}
          {right}
        </div>
      )}
      {hint && <p className="mt-1 text-[13px] leading-relaxed text-muted">{hint}</p>}
      {children && <div className={title || hint ? "mt-3" : ""}>{children}</div>}
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
    <div data-surface="white" className="group/scr relative mx-auto flex min-h-dvh max-w-md flex-col overflow-x-hidden bg-paper">
      {backdrop || null}
      {(title || back) && (
        <header className="pt-safe sticky top-0 z-20">
          <div className="flex h-14 items-center gap-1 bg-paper px-3">
            {back && <BackButton href={back} />}
            {title && <h1 className="min-w-0 flex-1 truncate text-[17px] font-extrabold text-ink">{title}</h1>}
            <div className="ml-auto flex justify-end">{right}</div>
          </div>
        </header>
      )}
      <main className={`relative z-10 flex-1 px-6 ${footer ? "pb-32" : "pb-10"}`}>{children}</main>
      {footer && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
          <div className="pb-4">{footer}</div>
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
    <div data-surface="gray" className="group/scr relative mx-auto min-h-dvh max-w-md overflow-x-hidden bg-field pb-28">
      {backdrop || null}
      <main className="relative z-10 px-4">
        {brand && (
          <div className="pt-safe flex h-14 items-center justify-between px-1">
            <span className="text-[17px] font-black text-accent">우연한 식탁</span>
            <Link href="/notifications" aria-label={unread ? `알림 ${unread}개` : "알림"} className="relative -mr-2 flex size-11 items-center justify-center text-faint">
              <Bell size={22} strokeWidth={2} />
              {unread > 0 && <span className="absolute right-2 top-2 min-w-[17px] rounded-full bg-accent px-1 text-center text-[10px] font-extrabold leading-[17px] text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        )}
        {title && (
          <div className="mt-3 flex items-end justify-between gap-3 px-1">
            <div>
              <h1 className="text-[26px] font-extrabold leading-[1.38] text-ink">{title}</h1>
              {sub && <p className="mt-1.5 text-[15px] text-muted">{sub}</p>}
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
    accent: "bg-accent text-white",
    dark: "bg-accent text-white",
    ink: "bg-ink text-white",
    light: "bg-field text-ink",
    outline: "bg-accent-soft text-accent-text",
  };
  return (
    <Link
      href={href}
      className={`flex h-[56px] w-full items-center justify-center gap-1.5 rounded-[14px] text-[17px] font-extrabold transition active:scale-[.985] ${map[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, required, optional, children }: { label: string; hint?: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[14px] font-extrabold text-ink2">{label}</span>
      {required && <Required />}
      {optional && <Optional />}
      {hint && <span className="ml-1.5 text-[13px] text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputCls =
  "h-[52px] w-full rounded-[12px] border-0 bg-field px-4 text-[16px] text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-accent";

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
          <span className="inline-flex h-11 items-center rounded-[22px] bg-field px-4 text-[15px] text-ink2 transition duration-150 peer-checked:bg-accent peer-checked:font-extrabold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
            {o}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] bg-card p-5 group-data-[surface=white]/scr:bg-field ${className}`}>{children}</div>;
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
    <Link href={href} className="block active:bg-line2">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-line2 overflow-hidden rounded-[20px] bg-card group-data-[surface=white]/scr:bg-field group-data-[surface=white]/scr:divide-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between px-1">
      <h2 className="text-[18px] font-extrabold text-ink">{children}</h2>
      {action}
    </div>
  );
}

// 다른 기기·자동 처리가 먼저 끝나 화면이 낡았을 때 나오는 오류들 (문구는 lib 그대로 두고 여기서 알아본다)
const STALE = /이미 (처리|끝났|답한|마감)|그사이|같은 순간|기한이 지나|새로 고쳐/;

export function ErrorText({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  const stale = STALE.test(msg);
  return (
    <div role="alert" className="rounded-[12px] bg-danger/10 px-4 py-3 text-[14px] font-bold text-danger">
      <p>{msg}</p>
      {stale && (
        <>
          <p className="mt-1 font-medium">그사이 상태가 바뀌었을 수 있어요. 새로고침해서 지금 상태를 확인해 주세요.</p>
          <StaleActions />
        </>
      )}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "leaf" | "ink" | "candle" | "danger" }) {
  const map = {
    muted: "bg-field text-muted",
    accent: "bg-accent-soft text-accent-text",
    leaf: "bg-accent-soft text-accent-text",
    ink: "bg-accent text-white",
    candle: "bg-warn-soft text-warn",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={`inline-flex h-7 shrink-0 items-center rounded-[14px] px-2.5 text-[13px] font-bold ${map[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon}
      <p className="mt-4 text-[17px] font-extrabold">{title}</p>
      {body && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-[16px] ${className}`} />;
}

/** 상단 단계 막대: 3px 세그먼트, 간격 4px. 오른쪽에 "4 / 6" 또는 "신청 1 / 3" */
export function StepBar({ step, total, prefix }: { step: number; total: number; prefix?: string }) {
  return (
    <div className="pt-safe">
      <div className="flex gap-1 px-6 pt-3" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-[3px] flex-1 rounded-full ${i < step ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      <p className="sr-only">{`${prefix ? `${prefix} ` : ""}${step}단계 / 전체 ${total}단계`}</p>
    </div>
  );
}

/** 단계 화면: 단계 막대 + 뒤로 + 진행 표시 + 왼쪽 정렬 굵은 제목 + 하단 꽉 찬 버튼 */
export function StepScreen({
  step,
  total,
  prefix,
  back,
  close,
  title,
  sub,
  children,
  footer,
}: {
  step: number;
  total: number;
  prefix?: string;
  back?: string;
  close?: string;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <StepBar step={step} total={total} prefix={prefix} />
      <div className="flex items-center justify-between px-3 pt-2.5">
        {close ? (
          <Link href={close} aria-label="닫기" className="flex size-11 items-center justify-center text-ink"><XIcon /></Link>
        ) : back ? (
          <BackButton href={back} />
        ) : (
          <span className="size-11" />
        )}
        <span aria-hidden="true" className="pr-3 text-[14px] tabular-nums text-muted">{prefix ? `${prefix} ` : ""}{step} / {total}</span>
      </div>
      <div className="px-6 pt-3">
        <h1 className="text-[26px] font-extrabold leading-[1.38] text-ink">{title}</h1>
        {sub && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{sub}</p>}
      </div>
      <main className={`flex-1 ${footer ? "pb-32" : "pb-10"}`}>{children}</main>
      {footer && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
          <div className="pb-4">{footer}</div>
        </div>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** 선택 줄 (A2 패턴): 높이 58, radius 16, 고르면 연초록 배경 + 초록 원형 체크 */
export function ChoiceRow({ name, value, label, sub, type = "checkbox", defaultChecked, right }: { name: string; value: string; label: ReactNode; sub?: ReactNode; type?: "checkbox" | "radio"; defaultChecked?: boolean; right?: ReactNode }) {
  return (
    <label className="block cursor-pointer">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="flex min-h-[58px] items-center gap-3 rounded-[16px] bg-row px-[18px] py-3 text-[16px] text-ink2 transition peer-checked:bg-accent-soft peer-checked:font-extrabold peer-checked:text-accent-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent [&_.ck]:bg-dot peer-checked:[&_.ck]:bg-accent">
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {sub && <span className="mt-0.5 block text-[13px] font-normal text-muted">{sub}</span>}
        </span>
        {right}
        <span className="ck flex size-6 shrink-0 items-center justify-center rounded-full transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
      </span>
    </label>
  );
}

/** 정보 줄: 왼쪽 회색 라벨, 오른쪽 굵은 값 */
export function InfoRows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4 py-3.5 text-[15px]">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 text-right font-bold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 회색 안내 박스 (환불 규정 등) */
export function NoteBox({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-field p-4 text-[13px] leading-[1.7] text-[#4a5a51]">
      {title && <div className="mb-1 font-extrabold text-ink">{title}</div>}
      {children}
    </div>
  );
}
