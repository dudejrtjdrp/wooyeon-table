"use client";

import { AlertTriangle, CalendarRange, Gauge, LayoutDashboard, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "오늘 처리할 일", icon: LayoutDashboard },
  { href: "/admin/matching", label: "자동 매칭 모니터", icon: Gauge },
  { href: "/admin/exceptions", label: "예외 처리함", icon: AlertTriangle },
  { href: "/admin/applicants", label: "신청자·결제", icon: Users },
  { href: "/admin/rounds", label: "회차·식당", icon: CalendarRange },
  { href: "/admin/settings", label: "매칭 기준", icon: SlidersHorizontal },
];

export function AdminNav({ exCount, mobile }: { exCount: number; mobile?: boolean }) {
  const path = usePathname();
  const on = (h: string) => (h === "/admin" ? path === "/admin" : path.startsWith(h));
  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2">
        {NAV.map(({ href, label }) => (
          <Link key={href} href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${on(href) ? "bg-white text-ink" : "text-white/70"}`}>
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="mt-6 flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={on(href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition ${on(href) ? "bg-white/12 font-semibold text-white" : "text-white/65 hover:bg-white/6 hover:text-white"}`}
        >
          <Icon size={18} strokeWidth={on(href) ? 2.3 : 1.8} />
          <span className="flex-1">{label}</span>
          {href === "/admin/exceptions" && exCount > 0 && (
            <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-5 text-white">{exCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
