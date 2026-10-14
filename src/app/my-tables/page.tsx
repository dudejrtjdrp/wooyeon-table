import { CalendarDays, ChevronRight, MapPin, Utensils } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EmptyState, IMG, LinkButton, Photo, Pill, SectionTitle, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDay, fmtSlot } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type A = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  table_id: string | null; created_at: string;
  rounds: { title: string };
  dining_tables: { id: string; slots: { starts_at: string; region: string } | null; venues: { name: string; address: string; price_range: string | null } | null } | null;
};

export default async function MyTables() {
  const me = await requireMe();
  const t = await now();
  const { data } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,table_id,created_at,rounds(title),dining_tables(id,slots(starts_at,region),venues(name,address,price_range))")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });
  const apps = (data ?? []) as unknown as A[];
  const { data: fb } = await db().from("feedbacks").select("application_id").eq("user_id", me.id);
  const reviewed = new Set((fb ?? []).map((f) => f.application_id));

  const tables = apps.filter((a) => a.match_status === "CONFIRMED" && a.dining_tables?.slots);
  const upcoming = tables.filter((a) => new Date(a.dining_tables!.slots!.starts_at).getTime() + 3 * 3600_000 > t.getTime() && !a.attendance_status?.match(/ATTENDED|NO_SHOW|CANCELED/));
  const past = tables.filter((a) => !upcoming.includes(a));
  const pending = apps.filter((a) => !tables.includes(a) && a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));
  const closed = apps.filter((a) => !tables.includes(a) && !pending.includes(a));

  const SUB = "신청한 식탁과 지난 만남을 한눈에 볼 수 있어요.";
  const icon = <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CalendarDays size={22} /></span>;
  const RowItem = ({ href, title, sub, pill }: { href: string; title: string; sub: string; pill?: React.ReactNode }) => (
    <Link href={href} className="shadow-card flex items-center gap-4 rounded-[20px] bg-card p-4 active:scale-[.99]">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{sub}</span>
      </span>
      {pill}
      <ChevronRight size={20} className="shrink-0 text-muted" />
    </Link>
  );

  if (!apps.length) {
    return (
      <TabScreen title="내 식탁" sub={SUB}>
        <EmptyState
          icon={<Photo src={IMG.roundTable} className="h-40 w-full rounded-[22px]" />}
          title="아직 앉은 식탁이 없어요"
          body="일정을 고르면 마감 시각에 테이블이 꾸려져요."
          action={<LinkButton href="/rounds">모집 중인 일정 보기</LinkButton>}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen title="내 식탁" sub={SUB}>
      {upcoming.map((a, i) => {
        const s = a.dining_tables!.slots!;
        const v = a.dining_tables?.venues;
        return (
          <section key={a.id} className="shadow-card animate-rise relative mt-6 overflow-hidden rounded-[26px] text-white">
            <Image src={i % 2 ? IMG.restaurantWindow : IMG.roundTable} alt="" fill sizes="448px" priority={i === 0} className="object-cover" style={{ objectPosition: "70% 60%" }} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1b1206]/80 via-[#1b1206]/45 to-[#1b1206]/10" />
            <div className="relative p-6">
              <span className="inline-flex rounded-full bg-white/85 px-3 py-1.5 text-[13px] font-semibold text-accent">다가오는 식탁</span>
              <p className="mt-4 text-[26px] font-bold tracking-[-0.03em]">{fmtSlot(s.starts_at)}</p>
              <p className="mt-1 text-[17px] font-semibold text-white/90">{s.region}{v ? ` · ${v.name}` : ""}</p>
              {v && <p className="mt-3 flex items-center gap-1.5 text-[14px] text-white/85"><MapPin size={16} />{v.address}</p>}
              {v?.price_range && <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-white/85"><Utensils size={16} />{v.price_range}</p>}
              <Link href={`/tables/${a.table_id}`} className="shadow-cta mt-6 flex h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-[17px] font-semibold text-white active:scale-[.985]">
                단체방 보기 <ChevronRight size={20} />
              </Link>
            </div>
          </section>
        );
      })}

      {pending.length > 0 && (
        <>
          <SectionTitle>진행 중인 신청</SectionTitle>
          <div className="space-y-2.5">
            {pending.map((a) => {
              const h = headline(a);
              return <RowItem key={a.id} href={`/applications/${a.id}`} title={a.rounds.title} sub={h.desc} pill={<Pill tone={h.tone}>{h.label}</Pill>} />;
            })}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionTitle>지난 식탁</SectionTitle>
          <div className="space-y-2.5">
            {past.map((a) => {
              const s = a.dining_tables!.slots!;
              const attended = a.attendance_status === "ATTENDED";
              const needReview = attended && !reviewed.has(a.id);
              return (
                <RowItem
                  key={a.id}
                  href={needReview ? `/tables/${a.table_id}/feedback` : `/tables/${a.table_id}`}
                  title={`${fmtDay(s.starts_at)} · ${s.region}`}
                  sub={a.dining_tables?.venues?.name ?? headline(a).label}
                  pill={needReview ? <Pill tone="accent">후기 남기기</Pill> : reviewed.has(a.id) ? <Pill tone="muted">후기 남김</Pill> : <Pill tone="muted">{headline(a).label}</Pill>}
                />
              );
            })}
          </div>
        </>
      )}

      {closed.length > 0 && (
        <>
          <SectionTitle>마무리된 신청</SectionTitle>
          <div className="space-y-2.5">
            {closed.map((a) => {
              const h = headline(a);
              return <RowItem key={a.id} href={`/applications/${a.id}`} title={a.rounds.title} sub={h.desc} pill={<Pill tone={h.tone}>{h.label}</Pill>} />;
            })}
          </div>
        </>
      )}
    </TabScreen>
  );
}
