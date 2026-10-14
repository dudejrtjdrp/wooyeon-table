"use client";

import { AlertTriangle, CalendarRange, CreditCard, Gauge, LayoutDashboard, MessageSquareText, ShieldCheck, SlidersHorizontal, UserCheck, Users, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 운영자가 하루에 하는 일 순서로 묶는다: 확인 → 매칭 → 사람 → 다음 회차 준비
const GROUPS = [
  { name: "오늘", items: [
    { href: "/admin", label: "오늘 처리할 일", icon: LayoutDashboard },
    { href: "/admin/exceptions", label: "예외 처리함", icon: AlertTriangle },
  ] },
  { name: "매칭과 모임", items: [
    { href: "/admin/matching", label: "자동 매칭 모니터", icon: Gauge },
    { href: "/admin/tables", label: "테이블·단체방", icon: UtensilsCrossed },
    { href: "/admin/attendance", label: "참석·취소·노쇼", icon: UserCheck },
  ] },
  { name: "참가자", items: [
    { href: "/admin/applicants", label: "신청자", icon: Users },
    { href: "/admin/payments", label: "결제·환불", icon: CreditCard },
    { href: "/admin/feedback", label: "피드백·안전", icon: ShieldCheck },
  ] },
  { name: "설정", items: [
    { href: "/admin/rounds", label: "회차·식당 재고", icon: CalendarRange },
    { href: "/admin/messages", label: "자동 메시지", icon: MessageSquareText },
    { href: "/admin/settings", label: "매칭 기준", icon: SlidersHorizontal },
  ] },
];

export function AdminNav({ exCount, mobile }: { exCount: number; mobile?: boolean }) {
  const path = usePathname();
  const on = (h: string) => (h === "/admin" ? path === "/admin" : path.startsWith(h));
  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2">
        {GROUPS.flatMap((g) => g.items).map(({ href, label }) => (
          <Link key={href} href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${on(href) ? "bg-white text-ink" : "text-white/70"}`}>
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="mt-5 flex flex-col gap-4 overflow-y-auto">
      {GROUPS.map((g) => (
        <div key={g.name}>
          <p className="px-3 pb-1 text-[11px] font-semibold text-white/40">{g.name}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={on(href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition ${on(href) ? "bg-white/12 font-semibold text-white" : "text-white/65 hover:bg-white/6 hover:text-white"}`}
              >
                <Icon size={17} strokeWidth={on(href) ? 2.3 : 1.8} />
                <span className="flex-1">{label}</span>
                {href === "/admin/exceptions" && exCount > 0 && (
                  <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-5 text-white">{exCount}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
