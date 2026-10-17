import { now } from "./clock";
import { type OpenRound, type Visit, pickNext } from "./recommend";
import { db } from "./supabase";

/**
 * 다음 일정 추천 하나 (홈 추천 카드·후기 직후 화면). 고르는 기준은 recommend.ts pickNext로,
 * 새 일정 알림과 같다: 참석 이력 전체의 동네·요일 횟수, 식당 점수가 낮았던 동네는 뒤로.
 */
export async function nextPick(userId: string) {
  const t = (await now()).toISOString();
  const [{ data: rounds }, { data: mine }, { data: past }] = await Promise.all([
    db().from("rounds").select("id,title,apply_deadline,slots(region,starts_at)").eq("status", "open").gt("apply_deadline", t).order("apply_deadline").limit(4),
    db().from("applications").select("round_id").eq("user_id", userId).neq("application_status", "CANCELED"),
    db().from("applications").select("id,dining_tables(slots(region,starts_at))").eq("user_id", userId).eq("attendance_status", "ATTENDED"),
  ]);
  const applied = new Set((mine ?? []).map((a) => a.round_id));
  const open = ((rounds ?? []) as OpenRound[]).filter((r) => !applied.has(r.id));
  const rows = ((past ?? []) as unknown as { id: string; dining_tables: { slots: { region: string; starts_at: string } } | null }[]).filter((p) => p.dining_tables?.slots);
  const { data: fbs } = rows.length ? await db().from("feedbacks").select("application_id,venue_score").in("application_id", rows.map((r) => r.id)) : { data: [] };
  const score = new Map((fbs ?? []).map((f) => [f.application_id, f.venue_score as number | null]));
  const visits: Visit[] = rows.map((p) => ({ region: p.dining_tables!.slots.region, startsAt: p.dining_tables!.slots.starts_at, venueScore: score.get(p.id) ?? null }));
  return pickNext(open, visits);
}
