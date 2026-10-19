import Link from "next/link";
import { LogOut } from "lucide-react";
import Image from "next/image";
import { IMG } from "@/components/ui";
import { Suspense } from "react";
import { ADMIN_LEVEL_LABEL, adminLevelOf, getMe, isActiveAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { logout } from "../login/actions";
import { Flash } from "./flash";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!isActiveAdmin(me)) return <div className="admin-theme min-h-dvh bg-paper">{children}</div>;
  const [{ count }, { data: clock }, t, level] = await Promise.all([
    db().from("exceptions").select("id", { count: "exact", head: true }).eq("status", "open"),
    db().from("app_clock").select("offset_seconds").eq("id", 1).single(),
    now(),
    adminLevelOf(me.id),
  ]);
  const virtual = Number(clock?.offset_seconds) !== 0;
  return (
    <div className="admin-theme flex min-h-dvh bg-paper">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line/70 bg-gradient-to-b from-white to-[#f3f7fd] px-4 py-6 md:flex">
        <Link href="/admin" className="flex items-center gap-3 px-2">
          <span className="relative size-11 overflow-hidden rounded-full ring-2 ring-white"><Image src={IMG.splashTable} alt="" fill sizes="44px" className="object-cover" /></span>
          <span>
            <span className="block text-[18px] font-bold tracking-[-0.02em] text-ink">우연한 식탁</span>
            <span className="block text-[13px] text-muted">운영자</span>
          </span>
        </Link>
        <AdminNav exCount={count ?? 0} />
        <div className="mt-auto shrink-0 space-y-2 border-t border-line px-2 pt-3">
          <div className={`rounded-xl px-3 py-2.5 text-[12px] ${virtual ? "bg-warn-soft text-warn" : "text-muted"}`}>
            <p className="font-semibold">{virtual ? "시연용 가상 시각" : "현재 시각"}</p>
            <p className="mt-0.5 tabular-nums">{fmtDateTime(t.toISOString())}</p>
          </div>
          <p className="px-3 text-[13px] text-muted">운영자 {me.name} · <span className={level === "viewer" ? "font-semibold text-warn" : ""}>{ADMIN_LEVEL_LABEL[level]}</span></p>
          <form action={logout} className="px-3"><button className="flex items-center gap-2 text-[14px] text-muted hover:text-ink"><LogOut size={17} />로그아웃</button></form>
          <Link href="/guide" className="block px-3 text-[12px] text-muted/70 hover:text-ink">심사위원 안내 보기</Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pt-3 text-[15px] font-bold text-ink">
            <span>우연한 식탁 운영</span>
            {virtual && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">가상 시각</span>}
          </div>
          <AdminNav exCount={count ?? 0} mobile />
        </div>
        <main className="admin-main mx-auto max-w-[1180px] px-5 py-8 md:px-9">
          {level === "viewer" && (
            <p className="mb-5 rounded-xl bg-warn-soft px-4 py-2.5 text-[13px] font-medium text-warn">조회 전용 계정이에요. 화면은 모두 볼 수 있지만 환불·제한·긴급 수정·설정 변경은 할 수 없어요.</p>
          )}
          {children}
        </main>
        <Suspense fallback={null}><Flash /></Suspense>
      </div>
    </div>
  );
}
