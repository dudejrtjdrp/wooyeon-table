import Link from "next/link";
import { Card, LinkButton, Pill } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { tick } from "@/lib/pipeline";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  const me = await getMe();
  if (!me) return <Landing />;
  // 마감·리마인드·모임 시작 같은 시간 이벤트를 화면을 열 때도 처리한다 (크론 보조)
  await tick().catch(() => null);

  const { data: apps } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,created_at,rounds(title)")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const { count: unread } = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me.id)
    .is("read_at", null)
    .lte("scheduled_at", (await now()).toISOString());

  const list = (apps ?? []) as unknown as {
    id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
    rounds: { title: string };
  }[];
  const active = list.find((a) => !["CANCELED"].includes(a.application_status) && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status));
  const finished = !active || ["ATTENDED", "NO_SHOW"].includes(active.attendance_status ?? "");
  const next = me.hasProfile && finished ? await nextPick(me.id) : null;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-accent">우연한 식탁</p>
        <nav className="flex items-center gap-4 text-[14px]">
          <Link href="/notifications" className="relative">
            알림
            {unread ? <span className="absolute -right-3 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{unread}</span> : null}
          </Link>
          <Link href="/me">내 정보</Link>
        </nav>
      </header>

      <h1 className="mt-8 text-[24px] font-bold leading-snug">{me.name}님, 안녕하세요</h1>

      {!me.hasProfile ? (
        <Card className="mt-6">
          <p className="text-[16px] font-semibold">프로필부터 채워 주세요</p>
          <p className="mt-1 text-[14px] text-muted">결이 맞는 사람을 찾으려면 몇 가지가 필요해요. 2분이면 돼요.</p>
          <div className="mt-4"><LinkButton href="/onboarding">프로필 작성하기</LinkButton></div>
        </Card>
      ) : active ? (
        <Link href={`/applications/${active.id}`} className="mt-6 block">
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-muted">{active.rounds.title}</p>
              <Pill tone={headline(active).tone}>{headline(active).label}</Pill>
            </div>
            <p className="mt-3 text-[17px] font-semibold leading-snug">{headline(active).desc}</p>
            <p className="mt-3 text-[13px] text-muted">자세히 보기 →</p>
          </Card>
        </Link>
      ) : next ? null : (
        <Card className="mt-6">
          <p className="text-[16px] font-semibold">이번 주 저녁, 새로운 사람들과 어때요?</p>
          <p className="mt-1 text-[14px] text-muted">날짜와 동네만 고르면 테이블은 저희가 꾸려요.</p>
          <div className="mt-4"><LinkButton href="/rounds">모집 중인 일정 보기</LinkButton></div>
        </Card>
      )}

      {next && (
        <Card className="mt-4">
          <p className="text-[13px] text-muted">다음 식탁 추천</p>
          <p className="mt-1 text-[16px] font-semibold leading-snug">{next.why}</p>
          <p className="mt-1 text-[14px] text-muted">{next.roundTitle} · 신청 마감 {fmtDate(next.deadline)} {fmtTime(next.deadline)}</p>
          <div className="mt-4"><LinkButton href={`/apply/${next.roundId}`}>이 일정 신청하기</LinkButton></div>
        </Card>
      )}

      {active && !next && (
        <div className="mt-4"><LinkButton href="/rounds" tone="light">다른 일정도 보기</LinkButton></div>
      )}
    </div>
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

function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-14">
      <p className="text-sm font-medium text-accent">우연한 식탁</p>
      <h1 className="mt-3 text-[28px] font-bold leading-snug tracking-tight">
        처음 만나는 네다섯 명과
        <br />
        저녁 한 끼 어때요?
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        날짜와 동네만 고르면 결이 맞는 사람들로 테이블을 꾸려 드려요. 식당 예약과 단체방까지 알아서 준비돼요.
      </p>
      <ol className="mt-10 space-y-4 text-[15px]">
        {[
          ["1", "나를 소개하고 갈 수 있는 날짜를 골라요"],
          ["2", "마감 시간에 4~6명 테이블이 자동으로 꾸려져요"],
          ["3", "식당과 단체방 안내를 받고 만나요"],
        ].map(([n, t]) => (
          <li key={n} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">{n}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto space-y-3 pt-12">
        <LinkButton href="/signup">시작하기</LinkButton>
        <LinkButton href="/login" tone="light">로그인</LinkButton>
        <p className="pt-2 text-center text-[13px] text-muted">
          <Link href="/guide" className="underline underline-offset-4">심사위원 안내 보기</Link>
        </p>
      </div>
    </main>
  );
}
