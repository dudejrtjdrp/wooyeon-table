import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { RoundTable } from "@/components/brand";
import { EmptyState, LinkButton, List, Pill, SectionTitle, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDay, fmtSlot } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type A = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  table_id: string | null; created_at: string;
  rounds: { title: string; match_at: string };
  dining_tables: { id: string; slots: { starts_at: string; region: string } | null; venues: { name: string; address: string; price_range: string | null } | null } | null;
};

export default async function MyTables() {
  const me = await requireMe();
  const t = await now();
  const { data } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,table_id,created_at,rounds(title,match_at),dining_tables(id,slots(starts_at,region),venues(name,address,price_range))")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });
  const apps = (data ?? []) as unknown as A[];
  const { data: fb } = await db().from("feedbacks").select("application_id").eq("user_id", me.id);
  const reviewed = new Set((fb ?? []).map((f) => f.application_id));

  const tables = apps.filter((a) => a.match_status === "CONFIRMED" && a.dining_tables?.slots);
  const upcoming = tables.filter((a) => new Date(a.dining_tables!.slots!.starts_at).getTime() + 3 * 3600_000 > t.getTime() && !a.attendance_status?.match(/ATTENDED|NO_SHOW|CANCELED/));
  const past = tables.filter((a) => !upcoming.includes(a));
  const pending = apps.filter((a) => !tables.includes(a) && a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));

  const SUB = "다가오는 테이블의 단체방과 지난 만남이에요.";
  const RowItem = ({ href, title, sub, pill }: { href: string; title: string; sub: string; pill?: React.ReactNode }) => (
    <Link href={href} className="flex min-h-[64px] items-center gap-3 px-5 py-3 active:bg-line2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-extrabold">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{sub}</span>
      </span>
      {pill}
      <ChevronRight size={18} className="shrink-0 text-[#b5c0ba]" />
    </Link>
  );

  if (!tables.length && !pending.length) {
    return (
      <TabScreen title="단체방" sub={SUB}>
        <EmptyState
          icon={<RoundTable size={150} filled={1} />}
          title="아직 단체방이 없어요"
          body="테이블이 정해지면 여기서 단체방이 열려요."
          action={<LinkButton href="/rounds">모집 중인 일정 보기</LinkButton>}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen title="단체방" sub={SUB}>
      {upcoming.map((a) => {
        const s = a.dining_tables!.slots!;
        const v = a.dining_tables?.venues;
        return (
          <section key={a.id} className="animate-rise mt-5 rounded-[24px] bg-navy p-[22px] text-white">
            <p className="text-[13px] font-bold text-on-accent">다가오는 테이블</p>
            <p className="mt-2 text-[22px] font-black leading-[1.35]">{fmtSlot(s.starts_at)}</p>
            <p className="mt-1 text-[15px] text-on-accent">{s.region}{v ? ` · ${v.name}` : " · 식당을 정하고 있어요"}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href={`/tables/${a.table_id}`} className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent2 text-[15px] font-extrabold">모임 정보</Link>
              <Link href={`/tables/${a.table_id}/chat`} className="flex h-[52px] items-center justify-center rounded-[14px] bg-paper text-[15px] font-extrabold text-accent">단체방 들어가기</Link>
            </div>
          </section>
        );
      })}

      {pending.length > 0 && !upcoming.length && (
        <Link href="/rounds" className="mt-5 flex min-h-[64px] items-center justify-between rounded-[18px] bg-card px-5 py-3">
          <span>
            <span className="block text-[16px] font-extrabold">진행 중인 신청 {pending.length}건</span>
            <span className="mt-0.5 block text-[13px] text-muted">테이블이 정해지면 여기서 단체방이 열려요.</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-[#b5c0ba]" />
        </Link>
      )}

      {past.length > 0 && (
        <>
          <SectionTitle>지난 테이블</SectionTitle>
          <List>
            {past.map((a) => {
              const s = a.dining_tables!.slots!;
              const attended = a.attendance_status === "ATTENDED";
              const needReview = attended && !reviewed.has(a.id);
              return (
                <RowItem
                  key={a.id}
                  href={needReview ? `/tables/${a.table_id}/feedback` : `/tables/${a.table_id}/chat`}
                  title={`${fmtDay(s.starts_at)} · ${s.region}`}
                  sub={a.dining_tables?.venues?.name ?? headline(a, t).label}
                  pill={needReview ? <Pill tone="accent">후기 남기기</Pill> : reviewed.has(a.id) ? <Pill tone="muted">후기 남김</Pill> : <Pill tone="muted">{headline(a, t).label}</Pill>}
                />
              );
            })}
          </List>
        </>
      )}

    </TabScreen>
  );
}
