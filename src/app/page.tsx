import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { PushToggle } from "@/components/push-toggle";
import { InstallCard } from "@/components/pwa";
import { AuthChooser } from "@/components/auth-chooser";
import { OfferBanner } from "@/components/offer-banner";
import { RoundTable } from "@/components/brand";
import { Card, LinkButton, List, Pill, Row, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dday, ddayLabel, fmtDayClock, fmtSlot } from "@/lib/format";
import { areasLabel } from "@/lib/regions";
import { maybeTick } from "@/lib/pipeline";
import { nextPick } from "@/lib/next-pick";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ActiveRow = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null; resolution: string | null;
  table_id: string | null; areas: string[] | null; dates: string[] | null;
  rounds: { title: string; match_at: string };
  dining_tables: { slots: { starts_at: string; ends_at: string; region: string } | null; venues: { name: string } | null } | null;
};

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await getMe();
  if (!me) {
    // 처음 온 사람에게 가장 가까운 모임 시각을 보여 준다
    const { data: soon } = await db().from("slots").select("starts_at,rounds!inner(status,apply_deadline)").eq("rounds.status", "open").gt("rounds.apply_deadline", (await now()).toISOString()).order("starts_at").limit(1);
    return <AuthChooser upcoming={soon?.[0] ? fmtSlot(soon[0].starts_at) : null} />;
  }
  const { m } = await searchParams;
  // 마감·리마인드·모임 시작 같은 시간 이벤트를 화면을 열 때도 처리한다 (크론 보조)
  // 밀린 일(마감·리마인드·종료)은 화면을 먼저 보낸 뒤 처리한다
  after(() => maybeTick().catch(() => null));
  const t = await now();

  const { data: apps } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,resolution,table_id,areas,dates,created_at,submitted_at,rounds(title,match_at),dining_tables(slots(starts_at,ends_at,region),venues(name))")
    .eq("user_id", me.id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(10);
  const list = (apps ?? []) as unknown as ActiveRow[];
  // 진행 중인 신청(결제 대기 포함)을 먼저 보여준다. 다시 신청하면 같은 줄을 되살리므로 생성 시각이 아니라 제출 시각으로 고른다
  // 결제하지 않은 채 매칭 시각이 지난 신청은 이번 매칭에서 빠졌으니 홈에 '결제 이어서 하기'로 남기지 않는다
  const unpaidClosed = (a: ActiveRow) => ["PENDING", "FAILED"].includes(a.payment_status) && new Date(a.rounds.match_at) <= t;
  const live = list.filter((a) => a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED") && !unpaidClosed(a));
  // 모임이 끝난 테이블은 체크인을 안 했어도 진행 중으로 보지 않는다 (지난 모임 카드가 'D-day'로 계속 남던 문제)
  const ended = (a: ActiveRow) => Boolean(a.dining_tables?.slots && new Date(a.dining_tables.slots.ends_at) <= t);
  const ongoing = live.filter((a) => !["ATTENDED", "NO_SHOW"].includes(a.attendance_status ?? "") && !ended(a));
  const active = ongoing[0] ?? live[0];
  const finished = !ongoing.length;
  const next = me.hasProfile && finished ? await nextPick(me.id) : null;

  const { data: open } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(region,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline")
    .limit(4);
  // 일정(날짜·시간)별로 묶어 보여준다
  const slotRows = new Map<string, { roundId: string; startsAt: string; regions: string[] }>();
  for (const r of (open ?? []) as { id: string; slots: { region: string; starts_at: string }[] | null }[]) {
    for (const sl of r.slots ?? []) {
      const k = `${r.id}|${sl.starts_at}`;
      const cur = slotRows.get(k) ?? { roundId: r.id, startsAt: sl.starts_at, regions: [] as string[] };
      if (!cur.regions.includes(sl.region)) cur.regions.push(sl.region);
      slotRows.set(k, cur);
    }
  }
  const upcoming = [...slotRows.values()].sort((x, y) => x.startsAt.localeCompare(y.startsAt)).slice(0, 4);

  return (
    <TabScreen>
      <Toast msg={m} />
      <div className="flex flex-col gap-2.5 pt-2.5">
        {me.hasProfile && <OfferBanner userId={me.id} />}

        {!me.hasProfile ? (
          <Card>
            <p className="text-[14px] text-muted">{me.name}님, 반가워요</p>
            <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">프로필부터 채워주세요</h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">결이 맞는 사람을 찾으려면 몇 가지가 필요해요. 2분이면 끝나요.</p>
            <div className="my-5 flex justify-center"><RoundTable size={180} filled={1} /></div>
            <LinkButton href="/onboarding">프로필 만들기</LinkButton>
          </Card>
        ) : active && !finished ? (
          <StatusCard a={active} t={t} />
        ) : next ? (
          // 신청을 마친 사람에게는 맞춤 추천 하나만 주 버튼으로 보여준다 (일반 '신청하기'와 경쟁하지 않게)
          <Card>
            <p className="text-[14px] text-muted">{me.name}님, 다음 테이블 추천</p>
            <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">{next.why}</h1>
            <div className="my-5 flex justify-center"><RoundTable size={200} filled={1} /></div>
            <p className="mb-3 text-center text-[14px] text-muted">{next.roundTitle} · {fmtSlot(next.deadline)} 마감</p>
            <LinkButton href={`/apply/${next.roundId}`}>다음 일정 신청하기</LinkButton>
          </Card>
        ) : (
          <Card>
            <p className="text-[14px] text-muted">{me.name}님</p>
            <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">{upcoming[0] ? <>이번 주 저녁,<br />같이 먹을래요?</> : <>다음 테이블을<br />준비하고 있어요</>}</h1>
            <div className="my-5 flex justify-center"><RoundTable size={200} filled={1} center={upcoming[0] ? <>{fmtDayClock(upcoming[0].startsAt)[0]}<br />{fmtDayClock(upcoming[0].startsAt)[1]}</> : null} /></div>
            <LinkButton href={upcoming[0] ? `/apply/${upcoming[0].roundId}` : "/my-tables"}>{upcoming[0] ? "신청하기" : "지난 테이블 보기"}</LinkButton>
          </Card>
        )}

        {active && (
          <List>
            {!finished && !["PENDING", "FAILED"].includes(active.payment_status) && <Row href={`/applications/${active.id}`} right={<ChevronRight size={18} className="text-muted" />}><span className="text-[15px]">결제 완료 · 영수증과 환불 규정</span></Row>}
            {finished && <Row href={`/applications/${active.id}`} right={<Pill tone={headline(active).tone}>{headline(active).label}</Pill>}><span className="text-[15px]">{active.rounds.title}</span></Row>}
          </List>
        )}

        {me.hasProfile && <InstallCard />}
        {me.hasProfile && <PushToggle variant="card" />}
      </div>

      {!!upcoming.length && (
        <>
          <SectionTitle action={<Link href="/rounds" className="flex h-11 items-center text-[14px] font-bold text-accent">전체 보기</Link>}>모집 중인 날</SectionTitle>
          <List>
            {upcoming.map((u) => (
              <Row key={`${u.roundId}${u.startsAt}`} href={`/apply/${u.roundId}`} right={<span className="text-[13px] font-bold text-accent">{ddayLabel(dday(u.startsAt, t))}</span>}>
                <span className="block text-[16px] font-extrabold">{fmtSlot(u.startsAt)}</span>
                <span className="mt-0.5 block truncate text-[13px] text-muted">{u.regions.join(" · ")}</span>
              </Row>
            ))}
          </List>
        </>
      )}

      {!list.length && me.hasProfile && (
        <>
          <SectionTitle>이렇게 진행돼요</SectionTitle>
          <Card>
            <ol className="space-y-4">
              {[
                ["동네와 날짜를 골라요", "여러 곳 고를수록 테이블이 잘 꾸려져요."],
                ["마감 시각에 4~6명 테이블이 자동으로 정해져요", "나이대, 성비, 관심사, 성향을 같이 봐요."],
                ["식당과 단체방 안내를 받고 만나요", "하루 전에 한 번 더 알려드려요."],
              ].map(([a, b], i) => (
                <li key={a} className="flex gap-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-extrabold text-accent-text">{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-bold">{a}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </TabScreen>
  );
}

// 지금 단계 이름은 status.ts headline과 같은 말을 쓴다 (매칭 대기·재배치 중·확인 중 등)
const STEPS = ["신청", "결제", "매칭", "확정"] as const;

/** E10 매칭 대기 / 확정 카드: 원형 테이블 + 진행 막대 */
function StatusCard({ a, t }: { a: ActiveRow; t: Date }) {
  const h = headline(a);
  const slot = a.dining_tables?.slots;
  const confirmed = a.match_status === "CONFIRMED" && slot && a.table_id;
  const paid = !["PENDING", "FAILED"].includes(a.payment_status);
  const failed = a.match_status === "ALTERNATIVE_OFFERED";
  const waiting = failed && a.resolution === "wait";
  const realloc = a.match_status === "REALLOCATING";
  const checking = a.match_status === "EXCEPTION";
  const at = confirmed ? 4 : paid ? 3 : 2;
  const dates = (a.dates ?? []).map((d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`);
  const where = `${dates.length > 1 ? `${dates[0]} 또는 ${dates.slice(1).map((x) => x.replace(/^\d+월 /, "")).join(", ")}` : dates[0] ?? a.rounds.title} · ${areasLabel(a.areas ?? [])}`;
  const title = confirmed ? "테이블이 정해졌어요" : failed ? (a.resolution === "wait" ? "자리가 나길 기다리고 있어요" : "이번엔 테이블을 못 만들었어요") : !paid ? "결제를 마치면 매칭에 들어가요" : realloc ? "다른 테이블을 찾고 있어요" : checking ? "운영팀이 확인하고 있어요" : a.match_status === "MATCHING" ? "같이 앉을 사람을 찾고 있어요" : "매칭 시각을 기다리고 있어요";
  const cta = confirmed ? ["테이블과 단체방 보기", `/tables/${a.table_id}`] : failed ? [a.resolution === "wait" ? "다른 방법으로 바꾸기" : "다음 방법 고르기", `/applications/${a.id}/resolve`] : !paid ? ["결제 이어서 하기", `/pay/${a.id}`] : ["신청 내용 보기", `/applications/${a.id}`];
  return (
    <section className="animate-rise rounded-[24px] bg-card px-[22px] pb-[22px] pt-6" aria-label="내 신청">
      <p className="text-[14px] text-muted">{confirmed ? `${fmtSlot(slot!.starts_at)} · ${slot!.region}` : where}</p>
      <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">{title}</h1>
      <div className="mx-auto mb-1 mt-5 flex justify-center">
        <RoundTable
          size={220}
          filled={confirmed ? 6 : failed ? 3 : 1}
          label={confirmed ? "자리가 모두 찬 테이블" : failed ? "세 자리만 찬 테이블" : "나와 빈 다섯 자리"}
          center={confirmed ? <>{ddayLabel(dday(slot!.starts_at, t))}</> : failed ? null : <>결과<br />{fmtDayClock(a.rounds.match_at)[0]}<br />{fmtDayClock(a.rounds.match_at)[1]}</>}
        />
      </div>
      <div className="mt-4 flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i + 1 < at ? "bg-accent" : i + 1 === at ? (waiting ? "bg-[#F4C542]" : failed ? "bg-danger" : "bg-seat") : "bg-line"}`} />)}
      </div>
      <ol className="mt-2 flex text-[12px] text-faint">
        {STEPS.map((s, i) => <li key={s} aria-current={i + 1 === at ? "step" : undefined} className={`flex-1 ${i + 1 === at ? `font-extrabold ${waiting ? "text-[#6b5410]" : failed ? "text-danger" : "text-accent"}` : ""}`}>{i + 1 === at ? h.label : s}</li>)}
      </ol>
      {(failed || !paid || realloc || checking) && <p className="mt-4 text-[14px] leading-relaxed text-muted">{h.desc}</p>}
      <LinkButton href={cta[1]} tone={confirmed || failed || !paid ? "accent" : "outline"} className="mt-5">{cta[0]}</LinkButton>
    </section>
  );
}
