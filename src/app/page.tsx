import { meetingEnded } from "@/lib/meeting-time";
import { AI_PHOTO_NOTE, isAiPhoto } from "@/lib/venue-photo-kind";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { AuthChooser } from "@/components/auth-chooser";
import { PushToggle } from "@/components/push-toggle";
import { OfferBanner } from "@/components/offer-banner";
import { TourEntry } from "@/components/tour-entry";
import { RoundTable } from "@/components/brand";
import { Card, LinkButton, PrimaryButton, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { checkInOpen } from "@/lib/attendance-rules";
import { afterMeetingCard } from "@/lib/feedback-rules";
import { checkIn } from "./tables/[id]/actions";
import { getMe } from "@/lib/auth";
import { usablePass } from "@/lib/billing";
import { now } from "@/lib/clock";
import { PASSES, isMembership } from "@/lib/constants";
import { autoKeepAt } from "@/lib/resolve";
import { dday, ddayLabel, fmtDay, fmtDayClock, fmtSlot } from "@/lib/format";
import { areasLabel } from "@/lib/regions";
import { maybeTick } from "@/lib/pipeline";
import { nextPick } from "@/lib/next-pick";
import { headline } from "@/lib/status";
import { nextStep } from "@/lib/next-step";
import { NextStepBox } from "@/components/next-step";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ActiveRow = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null; resolution: string | null;
  table_id: string | null; areas: string[] | null; dates: string[] | null;
  rounds: { title: string; match_at: string; status?: string; apply_deadline?: string | null };
  payments?: { pass_type: string | null } | null;
  application_slots?: { slots: { starts_at: string } | null }[];
  dining_tables: { status?: string; slots: { starts_at: string; ends_at: string; region: string } | null; venues: { name: string; photo_url: string | null; category: string | null } | null } | null;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

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
    .select("id,application_status,payment_status,match_status,attendance_status,resolution,table_id,areas,dates,created_at,submitted_at,rounds(title,match_at,status,apply_deadline),payments(pass_type),application_slots(slots(starts_at)),dining_tables(status,slots(starts_at,ends_at,region),venues(name,photo_url,category))")
    .eq("user_id", me.id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(10);
  const list = (apps ?? []) as unknown as ActiveRow[];
  // 진행 중인 신청(결제 대기 포함)을 먼저 보여준다. 다시 신청하면 같은 줄을 되살리므로 생성 시각이 아니라 제출 시각으로 고른다
  // 결제하지 않은 채 매칭 시각이 지난 신청은 이번 매칭에서 빠졌으니 홈에 '결제 이어서 하기'로 남기지 않는다
  const unpaidClosed = (a: ActiveRow) => ["PENDING", "FAILED"].includes(a.payment_status) && new Date(a.rounds.match_at) <= t;
  const live = list.filter((a) => a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED") && !unpaidClosed(a));
  // 모임이 끝난 테이블은 체크인을 안 했어도 진행 중으로 보지 않는다 (지난 모임 카드가 'D-day'로 계속 남던 문제)
  // 테이블 화면과 같은 기준: 끝난 시각이 지났거나 테이블이 '모임 끝'(DONE)이면 지난 모임
  const ended = (a: ActiveRow) => meetingEnded(a.dining_tables, t);
  // 체크인한 뒤에도 모임이 끝날 때까지는 홈 카드에 남긴다(체크인하자마자 '열린 일정이 없어요'로 바뀌지 않게)
  const ongoing = live.filter((a) => a.attendance_status !== "NO_SHOW" && !ended(a));
  const active = ongoing[0] ?? null;
  // 매칭 실패 안내를 받았으면 고르지 않을 때 정리되는 시각 (신청 상세·해결 화면과 같은 시각)
  const keepAt = active?.match_status === "ALTERNATIVE_OFFERED" ? (await autoKeepAt(active.id))?.toISOString() ?? null : null;
  const next = me.hasProfile && !active ? await nextPick(me.id) : null;
  // 체크인을 못 한 채 끝난 모임도 지난 식탁에 남긴다: 테이블 화면에서 '참석했는데 체크인을 못 했어요'로 알릴 수 있게
  const past = list.find((a) => a.id !== active?.id && a.table_id && a.dining_tables?.slots && (a.attendance_status === "ATTENDED" || ended(a)));

  // 끝난 모임 중 후기를 아직 안 남긴 것(또는 체크인을 못 해 알려야 하는 것)을 홈 맨 위에 하나 띄운다. 조건은 후기 요청(pipeline askFeedback)·후기 화면과 같다
  const endedMine = list
    .filter((a) => a.table_id && a.match_status === "CONFIRMED" && a.dining_tables?.slots && ended(a) && ["ATTENDED", "SCHEDULED"].includes(a.attendance_status ?? ""))
    .sort((x, y) => y.dining_tables!.slots!.ends_at.localeCompare(x.dining_tables!.slots!.ends_at));
  const [{ data: fbDone }, { data: claims }] = endedMine.length
    ? await Promise.all([
        db().from("feedbacks").select("application_id").in("application_id", endedMine.map((a) => a.id)),
        db().from("status_events").select("entity_id").in("entity_id", endedMine.map((a) => a.id)).eq("field", "attendance_claim"),
      ])
    : [{ data: [] }, { data: [] }];
  const reviewed = new Set((fbDone ?? []).map((f) => f.application_id as string));
  const claimedSet = new Set((claims ?? []).map((c) => c.entity_id as string));
  const afterCard = endedMine
    .map((a) => ({ a, kind: afterMeetingCard({ attendance: a.attendance_status, ended: true, endsAt: new Date(a.dining_tables!.slots!.ends_at), reviewed: reviewed.has(a.id), claimed: claimedSet.has(a.id), t }) }))
    .find((x) => x.kind);

  // 확정된 테이블이면 같이 앉는 사람 수와 이름 첫 글자를 보여 준다
  const members = active?.match_status === "CONFIRMED" && active.table_id
    ? ((await db().from("applications").select("user_id,users(name)").eq("table_id", active.table_id).eq("match_status", "CONFIRMED")).data ?? []) as unknown as { user_id: string; users: { name: string } | null }[]
    : [];
  const owned = me.hasProfile ? await usablePass(me.id, t) : null;

  const { data: open } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(region,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline")
    .limit(4);
  // 일정(날짜·시간)별로 묶어 보여준다
  const slotRows = new Map<string, { roundId: string; startsAt: string; deadline: string; regions: string[] }>();
  for (const r of (open ?? []) as { id: string; apply_deadline: string; slots: { region: string; starts_at: string }[] | null }[]) {
    for (const sl of r.slots ?? []) {
      const k = `${r.id}|${sl.starts_at}`;
      const cur = slotRows.get(k) ?? { roundId: r.id, startsAt: sl.starts_at, deadline: r.apply_deadline, regions: [] as string[] };
      if (!cur.regions.includes(sl.region)) cur.regions.push(sl.region);
      slotRows.set(k, cur);
    }
  }
  const upcoming = [...slotRows.values()].sort((x, y) => x.startsAt.localeCompare(y.startsAt)).slice(0, 6);
  const firstName = me.name.replace(/ 사용자$/, "");

  return (
    <TabScreen>
      <Toast msg={m} />
      <TourEntry userId={me.id} />
      {afterCard && <AfterMeetingCard a={afterCard.a} kind={afterCard.kind!} />}
      {me.hasProfile && <div className="pt-2"><OfferBanner userId={me.id} /></div>}

      {!me.hasProfile ? (
        <>
          <Greeting>{firstName}님, 반가워요<br />프로필부터 채워 주세요</Greeting>
          <Card className="mt-4">
            <p className="text-[15px] leading-relaxed text-muted">결이 맞는 사람을 찾으려면 몇 가지가 필요해요. 2분이면 끝나요.</p>
            <div className="my-5 flex justify-center"><RoundTable size={160} filled={1} /></div>
            <LinkButton href="/onboarding">프로필 만들기</LinkButton>
          </Card>
        </>
      ) : active ? (
        <>
          <Greeting>{greetingFor(active, firstName, t)}</Greeting>
          <StatusCard a={active} t={t} keepAt={keepAt} members={members.map((x) => x.users?.name ?? "")} meId={me.id} memberIds={members.map((x) => x.user_id)} />
          {/* 확정·하루 전 안내를 휴대폰으로 받으려면 알림을 켜야 해서, 진행 중인 신청이 있을 때 한 번 보여 준다 */}
          <div className="mt-3"><PushToggle variant="card" /></div>
        </>
      ) : next ? (
        // 신청을 마친 사람에게는 맞춤 추천 하나만 주 버튼으로 보여준다 (일반 '신청하기'와 경쟁하지 않게)
        <>
          <Greeting>{firstName}님, 다음 식탁은<br />언제로 할까요?</Greeting>
          <section className="animate-rise mt-4 overflow-hidden rounded-[20px] bg-card" aria-label="다음 테이블 추천">
            <Hero>
              <span className="text-[13px] font-semibold text-muted">추천 일정 · {fmtSlot(next.deadline)} 마감</span>
              <span className="mt-1 block text-[20px] font-bold leading-snug text-ink">{next.roundTitle}</span>
            </Hero>
            <div className="p-5 pt-4">
              <p className="text-[15px] leading-relaxed text-ink2">{next.why}</p>
              <LinkButton href={`/apply/${next.roundId}`} tone="ink" className="mt-5">다음 일정 신청하기</LinkButton>
            </div>
          </section>
        </>
      ) : upcoming[0] ? (
        <>
          <Greeting>{firstName}님,<br />이번 주 저녁 같이 먹을래요?</Greeting>
          <section className="animate-rise mt-4 overflow-hidden rounded-[20px] bg-card">
            <Hero>
              <span className="text-[13px] font-semibold text-muted">가장 가까운 모임</span>
              <span className="mt-1 block text-[20px] font-bold leading-snug text-ink">{fmtSlot(upcoming[0].startsAt)}</span>
            </Hero>
            <div className="p-5 pt-4">
              <p className="text-[14px] text-muted">1회 {won(PASSES.single.amount)} · 식사비는 현장에서 각자 계산해요</p>
              <LinkButton href={`/apply/${upcoming[0].roundId}`} tone="ink" className="mt-4">신청하기</LinkButton>
            </div>
          </section>
        </>
      ) : (
        // 열린 일정이 없을 때: 언제 어디서 보이는지와, 기다리는 동안 할 수 있는 것(원하는 동네 남기기)만 보여 준다
        <>
          <Greeting>{firstName}님,<br />지금은 열린 일정이 없어요</Greeting>
          <section className="animate-rise mt-4 rounded-[20px] bg-card px-5 pb-5 pt-7 text-center" aria-label="다음 일정 기다리기">
            <div className="flex justify-center"><RoundTable size={132} filled={1} label="빈 자리가 있는 원형 테이블" /></div>
            <h2 className="mt-5 text-[19px] font-bold text-ink">다음 식탁을 차리고 있어요</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">모집이 열리면 이 화면과 일정 탭에<br />바로 떠요.</p>
            <div className="mt-4 flex justify-center">
              <Link href="/wish?from=home" className="flex h-11 items-center text-[15px] font-semibold text-accent">가 보고 싶은 동네 남기기</Link>
            </div>
          </section>
        </>
      )}

      {!!upcoming.length && me.hasProfile && (
        <>
          <SectionTitle action={<Link href="/rounds" className="flex h-11 items-center text-[14px] font-bold text-accent">전체 보기</Link>}>다음 식탁</SectionTitle>
          {/* 가로로 넘기는 카드: 날짜·마감·가격만 보여 주고 동네는 신청할 때 고른다 */}
          <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {upcoming.map((u) => (
              <Link key={`${u.roundId}${u.startsAt}`} href={`/apply/${u.roundId}`} className="flex w-[216px] shrink-0 snap-start flex-col gap-1.5 rounded-[16px] bg-card p-4 active:bg-line2">
                <span className="self-start rounded-full bg-field px-2.5 py-1 text-[12px] font-semibold text-ink2">{ddayLabel(dday(u.startsAt, t))} · {u.regions.length}개 동네</span>
                <span className="mt-1 text-[16px] font-bold text-ink">{fmtSlot(u.startsAt)}</span>
                <span className="text-[13px] text-muted">{fmtSlot(u.deadline)} 마감 · {won(PASSES.single.amount)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* 결제 대기·매칭 실패처럼 지금 할 일이 있는 동안에는 멤버십 홍보로 주 버튼과 경쟁하지 않는다 */}
      {me.hasProfile && !owned && !!upcoming.length && !(active && (active.match_status === "ALTERNATIVE_OFFERED" || ["PENDING", "FAILED"].includes(active.payment_status))) && (
        <Link href="/rounds" className="mt-6 flex items-center justify-between gap-3 rounded-[18px] bg-accent-soft px-5 py-4 text-accent-text active:opacity-90">
          <span>
            <span className="block text-[13px] text-accent-text">한 달에 네 번 오면 1회권 {won(PASSES.single.amount * 4)}</span>
            <span className="mt-0.5 block text-[16px] font-bold">멤버십은 {won(PASSES.m1.amount)}으로 무제한</span>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      )}

      {past && (
        <>
          <SectionTitle action={<Link href="/my-tables" className="flex h-11 items-center text-[14px] font-bold text-accent">전체 보기</Link>}>지난 식탁</SectionTitle>
          <Link href={`/tables/${past.table_id}`} className="flex items-center justify-between gap-3 rounded-[16px] bg-card px-5 py-4 active:bg-line2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{fmtDay(past.dining_tables!.slots!.starts_at)} · {past.dining_tables?.venues?.name ?? past.dining_tables!.slots!.region}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{past.dining_tables!.slots!.region}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </>
      )}

      {!list.length && me.hasProfile && (
        <>
          <SectionTitle>이렇게 진행돼요</SectionTitle>
          <Card>
            <ol className="space-y-4">
              {[
                ["동네와 날짜를 골라요", "여러 곳 고를수록 테이블이 잘 꾸려져요."],
                ["마감 시각에 4~6명 테이블이 한 번에 정해져요", "인원이 먼저 찬다고 일찍 열리지 않아요. 나이대, 성비, 관심사, 성향을 같이 봐요."],
                ["정해지는 순간 식당·단체방·알림이 함께 열려요", "하루 전에 한 번 더 알려 드리고, 모임이 시작되면 테이블에서 나눌 이야기가 열려요."],
              ].map(([a, b], i) => (
                <li key={a} className="flex gap-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-text">{i + 1}</span>
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

/** 끝난 모임 안내: 별점 남기기(후기) 또는 체크인 못 한 걸 알리기 */
function AfterMeetingCard({ a, kind }: { a: ActiveRow; kind: "review" | "claim" }) {
  const slot = a.dining_tables!.slots!;
  const where = a.dining_tables?.venues?.name ?? slot.region;
  return (
    <section className="animate-rise mt-3 rounded-[20px] bg-card p-5" aria-label={kind === "review" ? "오늘 저녁 어땠는지 알려 주기" : "참석 알리기"}>
      <p className="text-[13px] font-semibold text-muted">{fmtDay(slot.starts_at)} · {where}</p>
      {kind === "review" ? (
        <>
          <h2 className="mt-1 text-[19px] font-bold leading-snug text-ink">함께한 저녁, 어땠어요?</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">별 다섯 개만 누르면 끝나요. 또 앉고 싶은 분을 고르면 다음 테이블을 꾸릴 때 바로 반영할게요.</p>
          <LinkButton href={`/tables/${a.table_id}/feedback`} className="mt-4">별점 남기기</LinkButton>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-[19px] font-bold leading-snug text-ink">체크인 기록이 없어요</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">참석했다면 모임 정보에서 알려 주세요. 운영팀이 확인하면 참석으로 바뀌고 별점을 남길 수 있어요.</p>
          <LinkButton href={`/tables/${a.table_id}`} className="mt-4">모임 정보에서 알리기</LinkButton>
        </>
      )}
    </section>
  );
}

function Greeting({ children }: { children: React.ReactNode }) {
  return <h1 className="mt-3 px-1 text-[22px] font-bold leading-[1.4] text-ink">{children}</h1>;
}

/** 카드 윗부분 색면: 사진 대신 식탁 그림과 핵심 한 줄 */
function Hero({ children, right, photo }: { children: React.ReactNode; right?: React.ReactNode; photo?: { src: string; alt: string } | null }) {
  if (photo) {
    // 식당 사진이 있으면 사진 위에 칩만 얹는다
    return (
      <div className="relative h-[150px] overflow-hidden bg-[#ebe0d1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={photo.alt} className="absolute inset-0 size-full object-cover" />
        <div className="absolute left-4 top-4">{children}</div>
        {isAiPhoto(photo.src) && <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">{AI_PHOTO_NOTE}</span>}
      </div>
    );
  }
  return (
    <div className="relative flex min-h-[112px] items-end justify-between gap-3 overflow-hidden bg-[#ebe0d1] px-5 pb-4 pt-5">
      <div className="relative z-10 min-w-0">{children}</div>
      <div className="pointer-events-none -mb-10 -mr-8 shrink-0 opacity-90" aria-hidden="true">{right ?? <RoundTable size={128} filled={1} />}</div>
    </div>
  );
}

function greetingFor(a: ActiveRow, name: string, t: Date) {
  // 상태 이름은 status.ts headline과 맞춘다('확인 중'·'결과 정리 중')
  const h = headline(a, t).label;
  if (h === "확인 중") return <>{name}님, 이번 신청은<br />운영팀이 확인하고 있어요</>;
  if (h === "결과 정리 중") return <>{name}님, 지금<br />테이블을 꾸리고 있어요</>;
  if (a.match_status === "CONFIRMED") return <>{name}님, 이번 식탁<br />자리가 정해졌어요</>;
  if (a.match_status === "ALTERNATIVE_OFFERED") return <>{name}님, 이번엔<br />다음 방법을 골라 주세요</>;
  if (["PENDING", "FAILED"].includes(a.payment_status)) return <>{name}님, 결제만 마치면<br />매칭에 들어가요</>;
  return <>{name}님, 같이 앉을 사람을<br />찾고 있어요</>;
}

// 지금 단계 이름은 status.ts headline과 같은 말을 쓴다 (매칭 대기·재배치 중·확인 중 등)
const STEPS = ["신청", "결제", "매칭", "확정"] as const;
const SEAT_TONES = ["#c9b8a4", "#a8b59b", "#d8b27a", "#9fa9b5", "#c4a29a"];

/** E10 매칭 대기 / 확정 카드: 식탁 그림 색면 + 사람 + 진행 막대 */
function StatusCard({ a, t, keepAt, members, memberIds, meId }: { a: ActiveRow; t: Date; keepAt?: string | null; members: string[]; memberIds: string[]; meId: string }) {
  const h = headline(a, t);
  const slot = a.dining_tables?.slots;
  const confirmed = a.match_status === "CONFIRMED" && slot && a.table_id;
  const paid = !["PENDING", "FAILED"].includes(a.payment_status);
  const failed = a.match_status === "ALTERNATIVE_OFFERED";
  const waiting = failed && a.resolution === "wait";
  const at = confirmed ? 4 : paid ? 3 : 2;
  const dates = [...(a.dates ?? [])].sort().map((d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`);
  const where = `${dates.length > 1 ? `${dates[0]} 또는 ${dates.slice(1).map((x) => x.replace(/^\d+월 /, "")).join(", ")}` : dates[0] ?? a.rounds.title} · ${areasLabel(a.areas ?? [])}`;
  const cta = confirmed ? ["모임 정보 보기", `/tables/${a.table_id}`] : failed ? [a.resolution === "wait" ? "다른 방법으로 바꾸기" : "다음 방법 고르기", `/applications/${a.id}/resolve`] : !paid ? ["결제 이어서 하기", `/pay/${a.id}`] : ["신청 내용 보기", `/applications/${a.id}`];
  const others = members.filter((_, i) => memberIds[i] !== meId);
  const canCheckIn = Boolean(confirmed) && a.attendance_status === "SCHEDULED" && checkInOpen(new Date(slot!.starts_at), new Date(slot!.ends_at), t);
  const checkedIn = Boolean(confirmed) && a.attendance_status === "ATTENDED";
  const step = nextStep({ ...a, matchAt: a.rounds.match_at, applyDeadline: a.rounds.apply_deadline, roundStatus: a.rounds.status, startsAt: slot?.starts_at, endsAt: slot?.ends_at, starts: (a.application_slots ?? []).flatMap((x) => (x.slots ? [x.slots.starts_at] : [])), membership: isMembership(a.payments?.pass_type), keepAt }, t);
  return (
    <section className="animate-rise mt-4 overflow-hidden rounded-[20px] bg-card" aria-label="내 신청">
      <Hero photo={confirmed && a.dining_tables?.venues?.photo_url ? { src: a.dining_tables.venues.photo_url, alt: `${a.dining_tables.venues.name} 분위기 사진` } : null} right={<RoundTable size={128} filled={confirmed ? 6 : failed ? 3 : 1} label={confirmed ? "자리가 모두 찬 테이블" : failed ? "세 자리만 찬 테이블" : "나와 빈 다섯 자리"} />}>
        <span className="inline-flex h-7 items-center rounded-full bg-ink px-3 text-[13px] font-semibold text-paper">
          {confirmed ? ddayLabel(dday(slot!.starts_at, t)) : failed || h.label === "결과 정리 중" || h.label === "확인 중" ? h.label : `결과 ${fmtDayClock(a.rounds.match_at).join(" ")}`}
        </span>
      </Hero>
      <div className="px-5 pt-4">
        <p className="text-[18px] font-bold leading-snug">{confirmed ? (a.dining_tables?.venues?.name ?? `${slot!.region} 테이블`) : a.rounds.title}</p>
        <p className="mt-1 text-[14px] text-muted">{confirmed ? [a.dining_tables?.venues?.category, `${fmtSlot(slot!.starts_at)} · ${slot!.region}`].filter(Boolean).join(" · ") : where}</p>
        {confirmed && others.length > 0 && (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="flex" aria-hidden="true">
              <span className="flex size-[30px] items-center justify-center rounded-full border-2 border-card bg-accent text-[12px] font-bold text-accent-ink">나</span>
              {others.slice(0, 5).map((n, i) => (
                <span key={i} style={{ background: SEAT_TONES[i % SEAT_TONES.length] }} className="-ml-2 flex size-[30px] items-center justify-center rounded-full border-2 border-card text-[12px] font-bold text-ink">{n.slice(0, 1)}</span>
              ))}
            </span>
            <span className="text-[13px] text-muted">{others.length + 1}명이 함께 앉아요</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 pt-4">
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i + 1 < at ? "bg-accent" : i + 1 === at ? (waiting ? "bg-candle" : failed ? "bg-danger" : confirmed ? "bg-accent" : "bg-seat") : "bg-line"}`} />)}
        </div>
        <ol className="mt-2 flex text-[12px] text-faint">
          {STEPS.map((s, i) => <li key={s} aria-current={i + 1 === at ? "step" : undefined} className={`flex-1 ${i + 1 === at ? `font-bold ${waiting ? "text-warn" : failed ? "text-danger" : "text-accent"}` : ""}`}>{i + 1 === at ? h.label : s}</li>)}
        </ol>
        {/* 다음에 일어날 일과 그 시각, 지금 할 수 있는 일 (신청 상세와 같은 문장) */}
        {step ? <NextStepBox s={step} className="mt-4" /> : !confirmed && <p className="mt-3 text-[14px] leading-relaxed text-muted">{h.desc}</p>}
        {canCheckIn ? (
          // 모임 1시간 전부터 끝날 때까지: 홈에서 바로 체크인 (모임 정보 화면과 같은 처리)
          <>
            <form action={checkIn} className="mt-4">
              <input type="hidden" name="table_id" value={a.table_id!} />
              <input type="hidden" name="from" value="home" />
              <PrimaryButton pendingText="체크인하는 중">도착했어요, 체크인</PrimaryButton>
            </form>
            <Link href={cta[1]} className="mt-1 flex h-11 items-center justify-center text-[14px] font-semibold text-accent">모임 정보 보기</Link>
          </>
        ) : (
          <>
            {checkedIn && <p className="mt-3 rounded-[12px] bg-accent-soft px-4 py-2.5 text-[14px] font-semibold text-accent-text">체크인했어요. 즐거운 저녁 되세요</p>}
            <LinkButton href={cta[1]} tone={confirmed ? "ink" : failed || !paid ? "accent" : "light"} className="mt-4">{cta[0]}</LinkButton>
          </>
        )}
        {confirmed && !canCheckIn && <Link href={`/applications/${a.id}`} className="mt-1 flex h-11 items-center justify-center text-[14px] text-muted underline underline-offset-4">결제·환불 규정</Link>}
      </div>
    </section>
  );
}
