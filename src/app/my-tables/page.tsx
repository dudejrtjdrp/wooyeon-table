import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { TableMark } from "@/components/brand";
import { EmptyState, LinkButton, List, Pill, Row, SectionTitle, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type A = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  table_id: string | null; created_at: string;
  rounds: { title: string };
  dining_tables: { id: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null } | null;
};

export default async function MyTables() {
  const me = await requireMe();
  const t = await now();
  const { data } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,table_id,created_at,rounds(title),dining_tables(id,slots(starts_at,region),venues(name))")
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

  if (!apps.length) {
    return (
      <TabScreen title="내 식탁">
        <EmptyState
          icon={<TableMark size={72} filled={0} />}
          title="아직 앉은 식탁이 없어요"
          body="일정을 고르면 마감 시각에 테이블이 꾸려져요."
          action={<LinkButton href="/rounds">모집 중인 일정 보기</LinkButton>}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen title="내 식탁">
      {upcoming.map((a) => {
        const s = a.dining_tables!.slots!;
        return (
          <Link key={a.id} href={`/tables/${a.table_id}`} className="mt-2 block rounded-3xl bg-ink p-5 text-white">
            <div className="flex items-center justify-between">
              <TableMark size={40} tone="white" glow />
              <span className="flex items-center gap-1 text-[13px] font-semibold text-candle">
                <MessageCircle size={15} /> 단체방
              </span>
            </div>
            <p className="mt-4 text-[20px] font-bold tracking-[-0.02em]">{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}</p>
            <p className="mt-1 text-[14px] text-white/70">{s.region}{a.dining_tables?.venues ? `, ${a.dining_tables.venues.name}` : ""}</p>
          </Link>
        );
      })}

      {pending.length > 0 && (
        <>
          <SectionTitle>진행 중인 신청</SectionTitle>
          <List>
            {pending.map((a) => {
              const h = headline(a);
              return (
                <Row key={a.id} href={`/applications/${a.id}`} right={<Pill tone={h.tone}>{h.label}</Pill>}>
                  <p className="text-[16px] font-semibold">{a.rounds.title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">{h.desc}</p>
                </Row>
              );
            })}
          </List>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionTitle>지난 식탁</SectionTitle>
          <List>
            {past.map((a) => {
              const s = a.dining_tables!.slots!;
              const attended = a.attendance_status === "ATTENDED";
              return (
                <Row
                  key={a.id}
                  href={attended && !reviewed.has(a.id) ? `/tables/${a.table_id}/feedback` : `/tables/${a.table_id}`}
                  right={
                    attended && !reviewed.has(a.id) ? (
                      <Pill tone="candle">후기 남기기</Pill>
                    ) : (
                      <ChevronRight size={20} className="text-muted" />
                    )
                  }
                >
                  <p className="text-[16px] font-semibold">{fmtDate(s.starts_at)} {s.region}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{headline(a).label}{reviewed.has(a.id) ? ", 후기 남김" : ""}</p>
                </Row>
              );
            })}
          </List>
        </>
      )}

      {closed.length > 0 && (
        <>
          <SectionTitle>마무리된 신청</SectionTitle>
          <List>
            {closed.map((a) => {
              const h = headline(a);
              return (
                <Row key={a.id} href={`/applications/${a.id}`} right={<Pill tone={h.tone}>{h.label}</Pill>}>
                  <p className="text-[15px]">{a.rounds.title}</p>
                </Row>
              );
            })}
          </List>
        </>
      )}
    </TabScreen>
  );
}
