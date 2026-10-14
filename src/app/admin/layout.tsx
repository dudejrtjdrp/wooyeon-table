import Link from "next/link";
import { getMe } from "@/lib/auth";
import { logout } from "../login/actions";

const NAV = [
  ["/admin", "오늘 처리할 일"],
  ["/admin/matching", "자동 매칭 모니터"],
  ["/admin/exceptions", "예외 처리함"],
  ["/admin/applicants", "신청자·결제"],
  ["/admin/rounds", "회차·식당"],
  ["/admin/settings", "매칭 기준"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me || me.role !== "admin") return <div className="min-h-dvh bg-[#faf8f4]">{children}</div>;
  return (
    <div className="flex min-h-dvh bg-[#faf8f4]">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-card px-4 py-6 md:flex">
        <Link href="/admin" className="px-2 text-[15px] font-bold text-accent">우연한 식탁 운영</Link>
        <nav className="mt-6 flex flex-col gap-1 text-[14px]">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-2 py-2 hover:bg-line/50">{label}</Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-[13px] text-muted">
          <Link href="/guide" className="block underline underline-offset-4">심사 안내</Link>
          <form action={logout}><button className="underline underline-offset-4">로그아웃</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex gap-3 overflow-x-auto border-b border-line bg-card px-4 py-3 text-[13px] md:hidden">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="shrink-0">{label}</Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
