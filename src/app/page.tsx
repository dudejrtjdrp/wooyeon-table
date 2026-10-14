import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { PushToggle } from "@/components/push-toggle";
import { InstallCard } from "@/components/pwa";
import { AuthChooser } from "@/components/auth-chooser";
import { OfferBanner } from "@/components/offer-banner";
import { TableMark, Wordmark } from "@/components/brand";
import { LinkButton, List, Pill, Row, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { tick } from "@/lib/pipeline";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ActiveRow = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  table_id: string | null;
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
    .select("id,application_status,payment_status,match_status,attendance_status,table_id,created_at,rounds(title,match_at),dining_tables(slots(starts_at,region),venues(name))")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const list = (apps ?? []) as unknown as ActiveRow[];
  const active = list.find((a) => a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));
  const finished = !active || ["ATTENDED", "NO_SHOW"].includes(active.attendance_status ?? "");
  const next = me.hasProfile && finished ? await nextPick(me.id) : null;

  const { data: open } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(region,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline")
    .limit(3);

  return (
    <TabScreen>
      <Toast msg={m} />
      <header className="pt-safe flex h-14 items-center">
        <Wordmark className="text-[18px]" />
      </header>

      <h1 className="mt-4 text-[24px] font-bold leading-snug tracking-[-0.02em]">
        {me.name}님,
        <br />
        {active?.match_status === "CONFIRMED" && !finished ? "곧 식탁에서 만나요" : "이번 주 저녁 어때요?"}
      </h1>

      {me.hasProfile && <OfferBanner userId={me.id} />}

      {!me.hasProfile ? (
        <div className="mt-6 rounded-3xl bg-accent p-6 text-white">
          <TableMark size={44} tone="white" filled={1} />
          <p className="mt-4 text-[19px] font-bold">프로필부터 채워 주세요</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/80">결이 맞는 사람을 찾으려면 몇 가지가 필요해요. 2분이면 끝나요.</p>
          <Link href="/onboarding" className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-accent">
            프로필 작성하기
          </Link>
        </div>
      ) : active && !finished ? (
        <StatusHero a={active} />
      ) : null}

      {me.hasProfile && <InstallCard />}
      {me.hasProfile && <PushToggle variant="card" />}

      {active && finished && (
        <Link href={`/applications/${active.id}`} className="mt-6 flex items-center justify-between rounded-3xl bg-card p-5">
          <div>
            <p className="text-[13px] text-muted">{active.rounds.title}</p>
            <p className="mt-1 text-[16px] font-semibold">{headline(active).desc}</p>
          </div>
          <Pill tone={headline(active).tone}>{headline(active).label}</Pill>
        </Link>
      )}

      {next && (
        <div className="mt-4 rounded-3xl bg-card p-5">
          <p className="text-[13px] font-semibold text-accent">다음 식탁 추천</p>
          <p className="mt-1.5 text-[17px] font-bold leading-snug">{next.why}</p>
          <p className="mt-1 text-[14px] text-muted">{next.roundTitle}, {fmtDateTime(next.deadline)} 마감</p>
          <LinkButton href={`/apply/${next.roundId}`} className="mt-4">이 일정 신청하기</LinkButton>
        </div>
      )}

      {!!open?.length && (
        <>
          <SectionTitle action={<Link href="/rounds" className="text-[14px] font-medium text-muted">전체 보기</Link>}>모집 중인 일정</SectionTitle>
          <List>
            {open.map((r) => {
              const days = [...new Set((r.slots ?? []).map((s) => dateKey(s.starts_at)))].sort();
              const regions = [...new Set((r.slots ?? []).map((s) => s.region))];
              return (
                <Row key={r.id} href="/rounds" right={<ChevronRight size={20} className="text-muted" />}>
                  <p className="text-[16px] font-semibold">{r.title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {days.map((d) => fmtDate(`${d}T12:00:00+09:00`)).join(", ")} / {regions.join(", ")}
                  </p>
                </Row>
              );
            })}
          </List>
        </>
      )}

      {!list.length && me.hasProfile && (
        <>
          <SectionTitle>이렇게 진행돼요</SectionTitle>
          <ol className="space-y-4 rounded-3xl bg-card p-5">
            {[
              ["갈 수 있는 날짜와 동네를 골라요", "여러 개 고를수록 테이블이 잘 꾸려져요."],
              ["마감 시각에 4~6명 테이블이 자동으로 꾸려져요", "나이대, 관심사, 성향을 함께 봐요."],
              ["식당과 단체방 안내를 받고 만나요", "모임 하루 전에 한 번 더 알려드려요."],
            ].map(([a, b], i) => (
              <li key={a} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{i + 1}</span>
                <div>
                  <p className="text-[15px] font-semibold">{a}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </TabScreen>
  );
}

/** 진행 중인 신청을 첫 화면 맨 위에 크게 보여준다 */
function StatusHero({ a }: { a: ActiveRow }) {
  const h = headline(a);
  const confirmed = a.match_status === "CONFIRMED";
  const slot = a.dining_tables?.slots;
  const href = confirmed && a.table_id ? `/tables/${a.table_id}` : `/applications/${a.id}`;
  return (
    <Link href={href} className={`mt-6 block rounded-3xl p-6 ${confirmed ? "bg-ink text-white" : "bg-accent text-white"}`}>
      <div className="flex items-start justify-between">
        <TableMark size={48} tone="white" filled={confirmed ? 6 : 2} glow={confirmed} />
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">{h.label}</span>
      </div>
      {confirmed && slot ? (
        <>
          <p className="mt-5 text-[22px] font-bold leading-snug tracking-[-0.02em]">
            {fmtDate(slot.starts_at)} {fmtTime(slot.starts_at)}
          </p>
          <p className="mt-1 text-[15px] text-white/75">{slot.region}{a.dining_tables?.venues ? `, ${a.dining_tables.venues.name}` : ""}</p>
          <p className="mt-5 flex items-center gap-1 text-[14px] font-semibold text-candle">
            테이블과 단체방 보기 <ChevronRight size={16} />
          </p>
        </>
      ) : (
        <>
          <p className="mt-5 text-[19px] font-bold leading-snug">{h.desc}</p>
          <p className="mt-1.5 text-[14px] text-white/75">{a.rounds.title}{a.match_status === "WAITING" ? `, ${fmtDateTime(a.rounds.match_at)} 매칭` : ""}</p>
          <p className="mt-5 flex items-center gap-1 text-[14px] font-semibold">
            {a.payment_status === "PENDING" ? "결제 이어서 하기" : a.match_status === "ALTERNATIVE_OFFERED" ? "다음 방법 고르기" : "진행 상황 보기"} <ChevronRight size={16} />
          </p>
        </>
      )}
    </Link>
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
  return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why: pastSlots.length ? "다음 식탁도 저희가 꾸려 드릴게요." : "이번 주 저녁, 새로운 사람들과 어때요?" };
}
