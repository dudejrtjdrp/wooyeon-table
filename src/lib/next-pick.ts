import { now } from "./clock";
import { db } from "./supabase";

/** 다음 일정 추천 하나: 아직 신청하지 않은 모집 중 회차에서, 지난번에 간 동네·요일과 맞는 일정을 먼저 (홈 추천 카드·후기 직후 화면이 같이 쓴다) */
export async function nextPick(userId: string) {
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
