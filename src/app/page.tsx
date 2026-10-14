import { CalendarDays, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { PushToggle } from "@/components/push-toggle";
import { InstallCard } from "@/components/pwa";
import { AuthChooser } from "@/components/auth-chooser";
import { OfferBanner } from "@/components/offer-banner";
import { Backdrop, IMG, LinkButton, Pill, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dday, ddayLabel, fmtDateTime, fmtSlot } from "@/lib/format";
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
  const confirmedSoon = active?.match_status === "CONFIRMED" && !finished;

  return (
    <TabScreen backdrop={<Backdrop side height={300} />}>
      <Toast msg={m} />
      <h1 className="animate-rise mt-6 text-[30px] font-bold leading-[1.3] tracking-[-0.03em] text-ink">
        {me.name}님,
        <br />
        <span className="text-accent">{confirmedSoon ? "곧 식탁에서 만나요" : "이번 주 저녁 어때요?"}</span>
      </h1>

      {me.hasProfile && <OfferBanner userId={me.id} />}

      {!me.hasProfile ? (
        <HeroCard
          pill={["프로필 필요", "candle"]}
          title="프로필부터 채워 주세요"
          desc="결이 맞는 사람을 찾으려면 몇 가지가 필요해요. 2분이면 끝나요."
          cta="프로필 작성하기"
          href="/onboarding"
        />
      ) : active && !finished ? (
        <StatusHero a={active} t={t} />
      ) : (
        <HeroCard
          pill={["새 식탁", "accent"]}
          title={upcoming[0] ? "이번 주 식탁이 열렸어요" : "다음 식탁을 준비 중이에요"}
          desc={upcoming[0] ? `${fmtSlot(upcoming[0].startsAt)}부터 신청할 수 있어요.` : "새 일정이 열리면 바로 알려드릴게요."}
          cta={upcoming[0] ? "일정 보러 가기" : "지난 식탁 보기"}
          href={upcoming[0] ? "/rounds" : "/my-tables"}
        />
      )}

      {me.hasProfile && <InstallCard />}
      {me.hasProfile && <PushToggle variant="card" />}

      {active && finished && (
        <Link href={`/applications/${active.id}`} className="shadow-card mt-4 flex items-center justify-between gap-3 rounded-[22px] bg-card p-5">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{active.rounds.title}</p>
            <p className="mt-1 text-[16px] font-semibold text-ink">{headline(active).desc}</p>
          </div>
          <Pill tone={headline(active).tone}>{headline(active).label}</Pill>
        </Link>
      )}

      {next && (
        <div className="shadow-card mt-4 rounded-[22px] bg-card p-5">
          <p className="text-[13px] font-semibold text-accent">다음 식탁 추천</p>
          <p className="mt-1.5 text-[18px] font-bold leading-snug text-ink">{next.why}</p>
          <p className="mt-1 text-[14px] text-muted">{next.roundTitle}, {fmtDateTime(next.deadline)} 마감</p>
          <LinkButton href={`/apply/${next.roundId}`} className="mt-4">이 일정 신청하기 <ChevronRight size={19} /></LinkButton>
        </div>
      )}

      {!!upcoming.length && (
        <>
          <SectionTitle action={<Link href="/rounds" className="flex items-center text-[15px] font-medium text-accent">전체 보기<ChevronRight size={18} /></Link>}>모집 중인 일정</SectionTitle>
          <div className="space-y-2.5">
            {upcoming.map((u) => (
              <Link key={`${u.roundId}${u.startsAt}`} href={`/apply/${u.roundId}`} className="shadow-card flex items-center gap-4 rounded-[20px] bg-card p-4 active:scale-[.99]">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CalendarDays size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-[16px] font-bold tracking-[-0.02em] text-ink">{fmtSlot(u.startsAt)}</span>
                  <span className="mt-0.5 block truncate text-[14px] text-muted">{u.regions.join(" · ")}</span>
                </span>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent">{ddayLabel(dday(u.startsAt, t))}</span>
                <ChevronRight size={20} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </>
      )}

      {!list.length && me.hasProfile && (
        <>
          <SectionTitle>이렇게 진행돼요</SectionTitle>
          <ol className="shadow-card space-y-4 rounded-[22px] bg-card p-5">
            {[
              ["갈 수 있는 날짜와 동네를 골라요", "여러 개 고를수록 테이블이 잘 꾸려져요."],
              ["마감 시각에 4~6명 테이블이 자동으로 꾸려져요", "나이대, 관심사, 성향을 함께 봐요."],
              ["식당과 단체방 안내를 받고 만나요", "모임 하루 전에 한 번 더 알려드려요."],
            ].map(([a, b], i) => (
              <li key={a} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{i + 1}</span>
                <div>
                  <p className="text-[15px] font-semibold text-ink">{a}</p>
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

/** 시안 B1의 큰 사진 카드: 왼쪽 글자, 오른쪽 식탁, 아래 블루 버튼 */
function HeroCard({ pill, title, desc, foot, cta, href }: { pill: [string, "accent" | "leaf" | "candle" | "muted" | "danger" | "ink"]; title: string; desc?: string; foot?: string; cta: string; href: string }) {
  return (
    <section className="shadow-card animate-rise relative mt-6 overflow-hidden rounded-[26px] bg-card">
      <Image src={IMG.homeBg} alt="" fill priority sizes="448px" className="object-cover" style={{ objectPosition: "57% 50%" }} />
      <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/55 to-white/0" />
      <div className="relative px-6 pb-5 pt-6">
        <Pill tone={pill[1]}>{pill[0]}</Pill>
        <p className="mt-4 max-w-[64%] text-[26px] font-bold leading-[1.25] tracking-[-0.03em] text-ink">{title}</p>
        {desc && <p className="mt-3 max-w-[56%] text-[15px] leading-relaxed text-[#4c5368]">{desc}</p>}
        {foot && (
          <>
            <span className="mt-5 block h-px w-6 bg-[#c9cfdb]" />
            <p className="mt-4 max-w-[60%] text-[14px] text-[#5d6478]">{foot}</p>
          </>
        )}
        <Link href={href} className="shadow-cta mt-20 flex h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-[17px] font-semibold text-white active:scale-[.985]">
          {cta} <ChevronRight size={20} />
        </Link>
      </div>
    </section>
  );
}

/** 진행 중인 신청을 첫 화면 맨 위에 크게 보여준다 */
function StatusHero({ a, t }: { a: ActiveRow; t: Date }) {
  const h = headline(a);
  const confirmed = a.match_status === "CONFIRMED";
  const slot = a.dining_tables?.slots;
  if (confirmed && slot && a.table_id) {
    return (
      <HeroCard
        pill={[`${h.label} · ${ddayLabel(dday(slot.starts_at, t))}`, "leaf"]}
        title={fmtSlot(slot.starts_at)}
        desc={`${slot.region}${a.dining_tables?.venues ? ` · ${a.dining_tables.venues.name}` : ""}`}
        cta="테이블과 단체방 보기"
        href={`/tables/${a.table_id}`}
      />
    );
  }
  const cta = a.payment_status === "PENDING" || a.payment_status === "FAILED" ? "결제 이어서 하기" : a.match_status === "ALTERNATIVE_OFFERED" ? "다음 방법 고르기" : "진행 상황 보기";
  const href = a.payment_status === "PENDING" || a.payment_status === "FAILED" ? `/pay/${a.id}` : a.match_status === "ALTERNATIVE_OFFERED" ? `/applications/${a.id}/resolve` : `/applications/${a.id}`;
  return (
    <HeroCard
      pill={[h.label, h.tone]}
      title={a.rounds.title}
      desc={a.match_status === "WAITING" && a.payment_status === "PAID" ? `${fmtSlot(a.rounds.match_at)}에 테이블을 꾸려요` : h.desc}
      cta={cta}
      href={href}
    />
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
