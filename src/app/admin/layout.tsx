import Link from "next/link";
import { TableMark } from "@/components/brand";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { logout } from "../login/actions";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me || me.role !== "admin") return <div className="min-h-dvh bg-paper">{children}</div>;
  const [{ count }, { data: clock }, t] = await Promise.all([
    db().from("exceptions").select("id", { count: "exact", head: true }).eq("status", "open"),
    db().from("app_clock").select("offset_seconds").eq("id", 1).single(),
    now(),
  ]);
  const virtual = Number(clock?.offset_seconds) !== 0;
  return (
    <div className="flex min-h-dvh bg-paper">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink px-3 py-5 md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-3 text-[15px] font-bold text-white">
          <TableMark size={24} tone="white" />
          우연한 식탁 운영
        </Link>
        <AdminNav exCount={count ?? 0} />
        <div className="mt-auto space-y-3 px-3">
          <div className={`rounded-xl px-3 py-2.5 text-[12px] ${virtual ? "bg-candle/20 text-candle" : "bg-white/6 text-white/60"}`}>
            <p className="font-semibold">{virtual ? "시연용 가상 시각" : "현재 시각"}</p>
            <p className="mt-0.5 tabular-nums">{fmtDateTime(t.toISOString())}</p>
          </div>
          <div className="flex items-center justify-between text-[13px] text-white/60">
            <span>{me.name}</span>
            <form action={logout}><button className="hover:text-white">로그아웃</button></form>
          </div>
          <Link href="/guide" className="block text-[12px] text-white/40 hover:text-white/70">심사위원 안내 보기</Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 bg-ink md:hidden">
          <div className="flex items-center justify-between px-4 pt-3 text-[14px] font-bold text-white">
            <span className="flex items-center gap-2"><TableMark size={20} tone="white" />우연한 식탁 운영</span>
            {virtual && <span className="rounded-full bg-candle/20 px-2 py-0.5 text-[11px] text-candle">가상 시각</span>}
          </div>
          <AdminNav exCount={count ?? 0} mobile />
        </div>
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
