import { meetingEnded } from "@/lib/meeting-time";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { RoundTable } from "@/components/brand";
import { EmptyState, LinkButton, List, Pill, SectionTitle, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDay, fmtSlot } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";
import { after } from "next/server";
import { maybeTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

type A = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null; resolution: string | null;
  table_id: string | null; created_at: string;
  rounds: { title: string; match_at: string };
  dining_tables: { id: string; status?: string; slots: { starts_at: string; ends_at?: string; region: string } | null; venues: { name: string; address: string; price_range: string | null } | null } | null;
};

export default async function MyTables() {
  const me = await requireMe();
  // 예약 실행(GitHub Actions)이 몇 시간씩 밀릴 때가 있어, 모임 화면을 열 때도 밀린 일(시작 콘텐츠·체크인 안내·리마인드)을 돌린다
  after(() => maybeTick().catch(() => null));
  const t = await now();
  const { data } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,resolution,table_id,created_at,rounds(title,match_at,status),dining_tables(id,status,slots(starts_at,ends_at,region),venues(name,address,price_range))")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });
  const apps = (data ?? []) as unknown as A[];
  const { data: fb } = await db().from("feedbacks").select("application_id").eq("user_id", me.id);
  const reviewed = new Set((fb ?? []).map((f) => f.application_id));

  const tables = apps.filter((a) => a.match_status === "CONFIRMED" && a.dining_tables?.slots);
  // 홈·모임 정보와 같은 기준(lib/meeting-time.ts): '모임 끝'이거나 끝나는 시각이 지났으면 지난 모임
  const upcoming = tables.filter((a) => !meetingEnded(a.dining_tables, t) && !a.attendance_status?.match(/ATTENDED|NO_SHOW|CANCELED/));
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
      <ChevronRight size={18} className="shrink-0 text-[#9a8c7e]" />
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

      {/* 진행 중인 신청: 상태를 그대로 보여 주고, 매칭 실패면 '단체방이 열려요' 대신 다음 방법 고르기로 보낸다 */}
      {pending.length > 0 && !upcoming.length && (() => {
        // 여러 건이어도 매칭 실패가 있으면 그 건을 먼저 보여 주고 다음 방법 고르기로 보낸다
        const isFailed = (x: (typeof pending)[number]) => x.match_status === "ALTERNATIVE_OFFERED" && x.resolution !== "wait";
        const a = pending.find(isFailed) ?? pending[0];
        const h = headline(a, t);
        const failed = isFailed(a);
        const many = pending.length > 1 && !failed;
        return (
          <Link href={failed ? `/applications/${a.id}/resolve` : many ? "/rounds" : `/applications/${a.id}`} className="mt-5 flex min-h-[64px] items-center gap-3 rounded-[18px] bg-card px-5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold">{many ? `진행 중인 신청 ${pending.length}건` : a.rounds.title}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{failed ? "다음 방법을 골라 주세요." : !many && new Date(a.rounds.match_at) > t ? `${fmtSlot(a.rounds.match_at)}에 테이블이 정해지면 여기서 단체방이 열려요.` : "테이블이 정해지면 여기서 단체방이 열려요."}</span>
            </span>
            {!many && <Pill tone={h.tone}>{h.label}</Pill>}
            <ChevronRight size={18} className="shrink-0 text-[#9a8c7e]" />
          </Link>
        );
      })()}

      {past.length > 0 && (
        <>
          <SectionTitle>지난 식탁</SectionTitle>
          <List>
            {past.map((a) => {
              const s = a.dining_tables!.slots!;
              const attended = a.attendance_status === "ATTENDED";
              const needReview = attended && !reviewed.has(a.id);
              // 끝난 모임인데 아직 '참석 예정'으로 남아 있으면(체크인 확인 전) '매칭 확정' 대신 '지난 모임'
              const label = a.attendance_status === "SCHEDULED" ? "지난 모임" : headline(a, t).label;
              return (
                <RowItem
                  key={a.id}
                  href={needReview ? `/tables/${a.table_id}/feedback` : `/tables/${a.table_id}/chat`}
                  title={`${fmtDay(s.starts_at)} · ${s.region}`}
                  sub={a.dining_tables?.venues?.name ?? label}
                  pill={needReview ? <Pill tone="accent">별점 남기기</Pill> : reviewed.has(a.id) ? <Pill tone="muted">별점 남김</Pill> : <Pill tone="muted">{label}</Pill>}
                />
              );
            })}
          </List>
        </>
      )}

    </TabScreen>
  );
}
