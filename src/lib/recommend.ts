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
      return { s, regionHit, dayHit, low: Boolean(r?.low), order: regionHit ? order(s.region) : 99 };
    })
    // 요일만 맞아도 식당이 별로였던 동네는 권하지 않는다
    .filter((x) => x.regionHit || (x.dayHit && !x.low))
    .sort((a, b) => Number(b.regionHit) - Number(a.regionHit) || a.order - b.order || Number(b.dayHit) - Number(a.dayHit) || a.s.starts_at.localeCompare(b.s.starts_at));
  const best = scored[0];
  if (!best) return { slot: null, kind: "any" };
  return { slot: best.s, kind: best.regionHit && best.dayHit ? "both" : best.regionHit ? "region" : "day" };
}

/** 그 동네(·요일)에 실제로 두 번 이상 갔을 때만 '늘/자주'라고 쓴다. 다른 동네에 한 번씩 간 사람에게는 붙이지 않는다 */
function isOften(pick: SlotPick<{ region: string; starts_at: string }>, prefs: Prefs): boolean {
  if (!pick.slot) return false;
  const region = pick.slot.region;
  const regionCount = prefs.regions.find((r) => r.region === region)?.count ?? 0;
  if (pick.kind === "both") return regionCount > 1 && prefs.dayCount > 1;
  if (pick.kind === "region") return regionCount > 1;
  return prefs.dayCount > 1;
}

/** 추천 알림 문구 */
export function recommendBody(title: string, pick: SlotPick<{ region: string; starts_at: string }>, prefs: Prefs, when: (iso: string) => string): string {
  // 알림 본문은 한 줄로: 무엇이 열렸는지만 쓰고 자세한 일정은 신청 화면에서 본다
  if (!pick.slot) return `${title} 신청을 받아요`;
  const day = `${DAYS[kstDay(pick.slot.starts_at)]}요일`;
  const often = isOften(pick, prefs);
  if (pick.kind === "both") return `${often ? "늘 오시던" : "지난번처럼"} ${day} ${pick.slot.region} · ${when(pick.slot.starts_at)}`;
  if (pick.kind === "region") return `${often ? "자주 오신" : "지난번에 오신"} ${pick.slot.region} · ${when(pick.slot.starts_at)}`;
  return `${often ? "늘 오시던" : "지난번과 같은"} ${day} · ${when(pick.slot.starts_at)} ${pick.slot.region}`;
}

/**
 * 두 번째 신청부터 멤버십 1개월을 권한다 (성효님 결정, 2026-10-18). 이미 쓸 수 있는 이용권이나 멤버십이 있으면 권하지 않는다.
 * 기본 선택은 바꾸지 않고 '추천' 표시와 계산만 보여 준다(고르는 건 참가자).
 */
export function membershipNudge(paidBefore: number, hasUsablePass: boolean, single: number, monthly: number): { key: "m1"; note: string } | null {
  if (hasUsablePass || paidBefore < 1) return null;
  const four = single * 4;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const lead = paidBefore === 1 ? "두 번째 신청이에요." : "다시 와 주셨네요.";
  return { key: "m1", note: `${lead} 한 달에 네 번 오면 1회권 ${won(four)}, 멤버십은 ${won(monthly)}이에요.` };
}

export type OpenRound = { id: string; title: string; apply_deadline: string; slots: { region: string; starts_at: string }[] | null };
export type NextPick = { roundId: string; roundTitle: string; deadline: string; why: string };

/**
 * 홈 추천 카드·후기 직후 화면의 다음 일정 하나 (알림 추천과 같은 기준: visitPrefs + pickSlotFor).
 * 마감이 가까운 회차부터 보고, 동네·요일이 맞는 일정이 있는 첫 회차를 고른다. 없으면 가장 가까운 회차.
 */
export function pickNext(rounds: OpenRound[], visits: Visit[]): NextPick | null {
  if (!rounds.length) return null;
  const prefs = visitPrefs(visits);
  for (const r of rounds) {
    const pick = pickSlotFor(r.slots ?? [], prefs);
    if (!pick.slot) continue;
    const often = isOften(pick, prefs);
    const day = `${DAYS[kstDay(pick.slot.starts_at)]}요일`;
    const why =
      pick.kind === "both" ? `${often ? "늘 오시던" : "지난번처럼"} ${day} ${pick.slot.region}, 이번에도 어때요?`
      : pick.kind === "region" ? `${pick.slot.region}에서 새로운 사람들과 한 번 더 앉아 볼까요?`
      : `${day} 저녁, 이번엔 ${pick.slot.region} 어때요?`;
    return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why };
  }
  const r = rounds[0];
  return { roundId: r.id, roundTitle: r.title, deadline: r.apply_deadline, why: visits.length ? "다음 테이블도 저희가 꾸려 드릴게요." : "이번 주 저녁, 새로운 사람들과 어때요?" };
}

