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
import { dday, ddayLabel, fmtClock, fmtDateTime, fmtDay, fmtSlot } from "@/lib/format";
import { areasLabel } from "@/lib/regions";
import { tick } from "@/lib/pipeline";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ActiveRow = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  table_id: string | null; areas: string[] | null; dates: string[] | null;
  rounds: { title: string; match_at: string };
  dining_tables: { slots: { starts_at: string; region: string } | null; venues: { name: string } | null } | null;
};

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await getMe();
  if (!me) return <AuthChooser />;
  const { m } = await searchParams;
  // 마감·리마인드·모임 시작 같은 시간 이벤트를 화면을 열 때도 처리한다 (크론 보조)
  // 밀린 일(마감·리마인드·종료)은 화면을 먼저 보낸 뒤 처리한다
  after(() => tick().catch(() => null));
  const t = await now();

  const { data: apps } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,table_id,areas,dates,created_at,submitted_at,rounds(title,match_at),dining_tables(slots(starts_at,region),venues(name))")
    .eq("user_id", me.id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(10);
  const list = (apps ?? []) as unknown as ActiveRow[];
  // 진행 중인 신청(결제 대기 포함)을 먼저 보여준다. 다시 신청하면 같은 줄을 되살리므로 생성 시각이 아니라 제출 시각으로 고른다
  const live = list.filter((a) => a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));
  const ongoing = live.filter((a) => !["ATTENDED", "NO_SHOW"].includes(a.attendance_status ?? ""));
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
        ) : (
          <Card>
            <p className="text-[14px] text-muted">{me.name}님</p>
            <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">{upcoming[0] ? <>이번 주 저녁,<br />같이 먹을래요?</> : <>다음 테이블을<br />준비하고 있어요</>}</h1>
            <div className="my-5 flex justify-center"><RoundTable size={200} filled={1} center={upcoming[0] ? <>{fmtDay(upcoming[0].startsAt)}<br />{fmtClock(upcoming[0].startsAt)}</> : null} /></div>
            <LinkButton href={upcoming[0] ? `/apply/${upcoming[0].roundId}` : "/my-tables"}>{upcoming[0] ? "신청하기" : "지난 테이블 보기"}</LinkButton>
          </Card>
        )}

        {active && (
          <List>
            {!finished && !["PENDING", "FAILED"].includes(active.payment_status) && <Row href={`/applications/${active.id}`} right={<ChevronRight size={18} className="text-[#b5c0ba]" />}><span className="text-[15px]">결제 완료 · 영수증과 환불 규정</span></Row>}
            {finished && <Row href={`/applications/${active.id}`} right={<Pill tone={headline(active).tone}>{headline(active).label}</Pill>}><span className="text-[15px]">{active.rounds.title}</span></Row>}
          </List>
        )}

        {next && (
          <Card>
            <p className="text-[13px] font-bold text-accent">다음 테이블 추천</p>
            <p className="mt-1.5 text-[18px] font-extrabold leading-snug">{next.why}</p>
            <p className="mt-1 text-[14px] text-muted">{next.roundTitle} · {fmtDateTime(next.deadline)} 마감</p>
            <LinkButton href={`/apply/${next.roundId}`} className="mt-4">이 일정 신청하기</LinkButton>
          </Card>
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

const STEPS = ["신청", "결제", "매칭 중", "확정"] as const;

/** E10 매칭 대기 / 확정 카드: 원형 테이블 + 진행 막대 */
function StatusCard({ a, t }: { a: ActiveRow; t: Date }) {
  const h = headline(a);
  const slot = a.dining_tables?.slots;
  const confirmed = a.match_status === "CONFIRMED" && slot && a.table_id;
  const paid = !["PENDING", "FAILED"].includes(a.payment_status);
  const failed = a.match_status === "ALTERNATIVE_OFFERED";
  const realloc = a.match_status === "REALLOCATING" || a.match_status === "EXCEPTION";
  const at = confirmed ? 4 : paid ? 3 : 2;
  const dates = (a.dates ?? []).map((d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`);
  const where = `${dates.length > 1 ? `${dates[0]} 또는 ${dates.slice(1).map((x) => x.replace(/^\d+월 /, "")).join(", ")}` : dates[0] ?? a.rounds.title} · ${areasLabel(a.areas ?? [])}`;
  const title = confirmed ? "테이블이 정해졌어요" : failed ? "이번엔 테이블을 못 만들었어요" : !paid ? "결제를 마치면 매칭에 들어가요" : realloc ? "다른 테이블을 찾고 있어요" : "같이 앉을 사람을 찾고 있어요";
  const cta = confirmed ? ["테이블과 단체방 보기", `/tables/${a.table_id}`] : failed ? ["다음 방법 고르기", `/applications/${a.id}/resolve`] : !paid ? ["결제 이어서 하기", `/pay/${a.id}`] : ["진행 상황 보기", `/applications/${a.id}`];
  return (
    <section className="animate-rise rounded-[24px] bg-card px-[22px] pb-[22px] pt-6" aria-label="내 신청">
      <p className="text-[14px] text-muted">{confirmed ? `${fmtSlot(slot!.starts_at)} · ${slot!.region}` : where}</p>
      <h1 className="mt-1.5 text-[23px] font-black leading-[1.4]">{title}</h1>
      <div className="mx-auto mb-1 mt-5 flex justify-center">
        <RoundTable
          size={220}
          filled={confirmed ? 6 : failed ? 3 : 1}
          label={confirmed ? "자리가 모두 찬 테이블" : failed ? "세 자리만 찬 테이블" : "나와 빈 다섯 자리"}
          center={confirmed ? <>{ddayLabel(dday(slot!.starts_at, t))}</> : failed ? null : <>결과<br />{fmtDay(a.rounds.match_at)}<br />{fmtClock(a.rounds.match_at)}</>}
        />
      </div>
      <div className="mt-4 flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i + 1 < at ? "bg-accent" : i + 1 === at ? (failed ? "bg-danger" : "bg-seat") : "bg-line"}`} />)}
      </div>
      <ol className="mt-2 flex text-[12px] text-faint">
        {STEPS.map((s, i) => <li key={s} aria-current={i + 1 === at ? "step" : undefined} className={`flex-1 ${i + 1 === at ? `font-extrabold ${failed ? "text-danger" : "text-accent"}` : ""}`}>{i + 1 === at && failed ? "매칭 실패" : realloc && i + 1 === at ? "재배치 중" : s}</li>)}
      </ol>
      {(failed || !paid || realloc) && <p className="mt-4 text-[14px] leading-relaxed text-muted">{h.desc}</p>}
      <LinkButton href={cta[1]} tone={confirmed || failed || !paid ? "accent" : "outline"} className="mt-5">{cta[0]}</LinkButton>
    </section>
  );
}

/**
 * 다음 일정 추천 (RET-02). 아직 신청 안 한 모집 중 차수 가운데,
 * 지난번에 참석한 동네·요일과 맞는 일정을 먼저 고른다.
 */
async function nextPick(userId: string) {
  const t = (await now()).toISOString();
  const [{ data: rounds }, { data: mine }, { data: past }] = await Promise.all([
    db().from("rounds").select("id,title,apply_deadline,slots(region,starts_at)").eq("status", "open").gt("apply_deadline", t).order("apply_deadline").limit(4),
    db().from("applications").select("round_id").eq("user_id", userId).neq("application_status", "CANCELED"),
    db().from("applications").select("dining_tables(slots(region,starts_at))").eq("user_id", userId).eq("attendance_status", "ATTENDED").limit(5),
  ]);
  const applied = new Set((mine ?? []).map((a) => a.round_id));
  const open = (rounds ?? []).filter((r) => !applied.has(r.id));
  if (!open.length) return null;
  const pastSlots = ((past ?? []) as unknown as { dining_tables: { slots: { region: string; starts_at: string } } | null }[])
    .map((p) => p.dining_tables?.slots)
    .filter((x): x is { region: string; starts_at: string } => !!x);
  const day = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).getUTCDay();
  const DAYS = "일월화수목금토";
  for (const r of open) {
    for (const s of [...(r.slots ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      const same = pastSlots.find((p) => p.region === s.region && day(p.starts_at) === day(s.starts_at));
      if (same) return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why: `지난번처럼 ${DAYS[day(s.starts_at)]}요일 ${s.region}, 이번에도 어때요?` };
    }
    const region = pastSlots[0]?.region;
    if (region && (r.slots ?? []).some((s) => s.region === region)) {
      return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why: `${region}에서 새로운 사람들과 한 번 더 앉아 볼까요?` };
    }
  }
  const r = open[0];
  return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why: pastSlots.length ? "다음 테이블도 저희가 꾸려 드릴게요." : "이번 주 저녁, 새로운 사람들과 어때요?" };
}
