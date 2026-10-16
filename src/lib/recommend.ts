// 다음 일정 추천 (RET-02, F9). DB 없이 계산하는 부분만 따로 둬서 테스트로 확인한다.
// 참석 이력 전체에서 가장 많이 간 동네·요일을 고르고, 식당 점수가 낮았던 동네는 뒤로 미룬다.
// 마지막 한 번만 보면 우연히 한 번 간 곳을 계속 권하게 돼서, 횟수로 본다.

export type Visit = { region: string; startsAt: string; venueScore?: number | null };
export type RegionPref = { region: string; count: number; venueAvg: number | null; low: boolean; last: string };
export type Prefs = { regions: RegionPref[]; day: number | null; dayCount: number; visits: number };

/** 식당 점수 평균이 이 값 이하인 동네는 추천 순위를 내린다 */
export const LOW_VENUE = 2.5;
export const DAYS = "일월화수목금토";
export const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).getUTCDay();

export function visitPrefs(visits: Visit[]): Prefs {
  const by = new Map<string, { count: number; scores: number[]; last: string }>();
  const days = new Map<number, { count: number; last: string }>();
  for (const v of visits) {
    const r = by.get(v.region) ?? { count: 0, scores: [], last: "" };
    r.count++;
    if (typeof v.venueScore === "number") r.scores.push(v.venueScore);
    if (v.startsAt > r.last) r.last = v.startsAt;
    by.set(v.region, r);
    const d = kstDay(v.startsAt);
    const x = days.get(d) ?? { count: 0, last: "" };
    x.count++;
    if (v.startsAt > x.last) x.last = v.startsAt;
    days.set(d, x);
  }
  const regions = [...by.entries()]
    .map(([region, r]) => {
      const venueAvg = r.scores.length ? r.scores.reduce((a, b) => a + b, 0) / r.scores.length : null;
      return { region, count: r.count, venueAvg, low: venueAvg !== null && venueAvg <= LOW_VENUE, last: r.last };
    })
    // 식당이 별로였던 동네는 뒤로, 그다음 많이 간 순, 같으면 최근에 간 순
    .sort((a, b) => Number(a.low) - Number(b.low) || b.count - a.count || b.last.localeCompare(a.last) || a.region.localeCompare(b.region));
  const topDay = [...days.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))[0];
  return { regions, day: topDay ? topDay[0] : null, dayCount: topDay ? topDay[1].count : 0, visits: visits.length };
}

export type SlotPick<S> = { slot: S; kind: "both" | "region" | "day" } | { slot: null; kind: "any" };

/** 모집 중 일정 중 이 사람에게 가장 맞는 것. 동네가 맞는 게 요일만 맞는 것보다 먼저다 */
export function pickSlotFor<S extends { region: string; starts_at: string }>(slots: S[], prefs: Prefs): SlotPick<S> {
  const rank = new Map(prefs.regions.map((r) => [r.region, r]));
  const order = (r: string) => prefs.regions.findIndex((x) => x.region === r);
  const scored = slots
    .map((s) => {
      const r = rank.get(s.region);
      // 식당이 별로였던 동네는 '동네가 맞음'으로 치지 않는다
      const regionHit = Boolean(r && !r.low);
      const dayHit = prefs.day !== null && kstDay(s.starts_at) === prefs.day;
      return { s, regionHit, dayHit, order: regionHit ? order(s.region) : 99 };
    })
    .filter((x) => x.regionHit || x.dayHit)
    .sort((a, b) => Number(b.regionHit) - Number(a.regionHit) || a.order - b.order || Number(b.dayHit) - Number(a.dayHit) || a.s.starts_at.localeCompare(b.s.starts_at));
  const best = scored[0];
  if (!best) return { slot: null, kind: "any" };
  return { slot: best.s, kind: best.regionHit && best.dayHit ? "both" : best.regionHit ? "region" : "day" };
}

/** 추천 알림 문구 */
export function recommendBody(title: string, pick: SlotPick<{ region: string; starts_at: string }>, prefs: Prefs, when: (iso: string) => string): string {
  if (!pick.slot) return `${title} 모집을 시작했어요. 새로운 사람들과 한 번 더 앉아 볼까요?`;
  const day = `${DAYS[kstDay(pick.slot.starts_at)]}요일`;
  const often = prefs.visits > 1;
  if (pick.kind === "both") return `${often ? "자주 오신" : "지난번처럼"} ${day} ${pick.slot.region} 일정이 열렸어요. ${when(pick.slot.starts_at)}, 이번에도 어때요?`;
  if (pick.kind === "region") return `${often ? "자주 오신" : "지난번에 오신"} ${pick.slot.region}에서 새 식탁이 열렸어요. ${when(pick.slot.starts_at)} 일정을 확인해 보세요.`;
  return `${often ? "자주 오신" : "지난번과 같은"} ${day} 저녁 일정이 열렸어요. ${when(pick.slot.starts_at)} ${pick.slot.region}, 새 동네에서 앉아 볼까요?`;
}
