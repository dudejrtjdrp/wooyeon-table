import {
  type Candidate,
  type MatchSettings,
  type Relations,
  type ScoreDetail,
  type Weights,
  pairKey,
} from "./types";

/** MBTI 두 사람 점수. docs/02-matching-rules.md 3장 표 그대로 */
export function mbtiPair(a: string | null, b: string | null): number {
  if (!a || !b || a.length !== 4 || b.length !== 4) return 0.5;
  let s = 0;
  // N/S가 같으면 관심 주제가 비슷하다
  if (a[1] === b[1]) s += 0.4;
  // E/I가 다르면 말하는 사람과 듣는 사람이 섞인다
  if (a[0] !== b[0]) s += 0.3;
  else if (a[0] === "E") s += 0.2;
  // J/P가 같으면 약속·진행 방식이 비슷하다
  if (a[3] === b[3]) s += 0.2;
  // T/F는 어느 쪽이든
  s += 0.1;
  return s;
}

function sharedCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let n = 0;
  for (const x of b) if (set.has(x)) n++;
  return n;
}

/** 테이블의 절반 이상이 고른 관심사 */
export function commonInterests(members: Candidate[]): string[] {
  const count = new Map<string, number>();
  for (const m of members) for (const i of new Set(m.interests)) count.set(i, (count.get(i) ?? 0) + 1);
  const need = Math.max(2, Math.ceil(members.length / 2));
  return [...count.entries()]
    .filter(([, n]) => n >= need)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([k]) => k);
}

export function scoreGroup(
  members: Candidate[],
  rel: Relations,
  settings: MatchSettings,
): ScoreDetail {
  const n = members.length;
  const years = members.map((m) => m.birthYear);
  const oldest = Math.min(...years);
  const youngest = Math.max(...years);
  const ageGap = youngest - oldest;
  const male = members.filter((m) => m.gender === "M").length;
  const female = n - male;

  let pairs = 0;
  let mbtiSum = 0;
  let interestSum = 0;
  let metPairs = 0;
  let againPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = members[i];
      const b = members[j];
      pairs++;
      mbtiSum += mbtiPair(a.mbti, b.mbti);
      // 겹치는 관심사가 2개면 만점
      interestSum += Math.min(1, sharedCount(a.interests, b.interests) / 2);
      const k = pairKey(a.userId, b.userId);
      if (rel.met.has(k)) metPairs++;
      if (rel.again.has(k)) againPairs++;
    }
  }

  // 희망 성향: 각자 원한 성향을 가진 사람이 같은 테이블에 있는 비율
  let wantedSum = 0;
  let wantedTotal = 0;
  let wantedMet = 0;
  for (const m of members) {
    if (m.wantedTraits.length === 0) continue;
    wantedTotal++;
    const others = members.filter((o) => o !== m);
    const hit = others.filter((o) => sharedCount(m.wantedTraits, o.myTraits) > 0).length;
    if (hit > 0) wantedMet++;
    wantedSum += others.length ? hit / others.length : 0;
  }

  const parts: Record<keyof Weights, number> = {
    age: Math.max(0, 1 - ageGap / settings.maxAgeGap),
    gender: n ? 1 - Math.abs(male - female) / n : 0,
    mbti: pairs ? mbtiSum / pairs : 0.5,
    interests: pairs ? interestSum / pairs : 0,
    wanted: wantedTotal ? Math.min(1, (wantedSum / wantedTotal) * 2) : 1,
    fresh: pairs ? 1 - metPairs / pairs : 1,
  };

  const w = settings.weights;
  const base =
    parts.age * w.age +
    parts.gender * w.gender +
    parts.mbti * w.mbti +
    parts.interests * w.interests +
    parts.wanted * w.wanted +
    parts.fresh * w.fresh;
  const weightSum = w.age + w.gender + w.mbti + w.interests + w.wanted + w.fresh;
  const bonus = Math.min(6, againPairs * 2);
  const total = Math.round(((base / weightSum) * 100 + bonus) * 10) / 10;

  return {
    parts,
    bonus,
    total,
    ageGap,
    oldestBirthYear: oldest,
    youngestBirthYear: youngest,
    male,
    female,
    mbtiList: members.map((m) => m.mbti ?? "?"),
    commonInterests: commonInterests(members),
    wantedMet,
    wantedTotal,
    metPairs,
    totalPairs: pairs,
  };
}

/** 참가자에게 보여줄 묶인 이유. 가중 기여도가 높은 항목 3개 */
export function reasonsFor(detail: ScoreDetail, settings: MatchSettings): string[] {
  const w = settings.weights;
  const lines: { v: number; text: string }[] = [];
  lines.push({ v: detail.parts.age * w.age, text: detail.ageGap <= 3 ? "비슷한 또래예요" : "나이 차가 크지 않은 분들이에요" });
  lines.push({
    v: detail.parts.gender * w.gender,
    text: detail.male === detail.female ? "남녀가 반반이에요" : "성비를 고르게 맞췄어요",
  });
  lines.push({ v: detail.parts.mbti * w.mbti, text: "대화 템포가 잘 맞을 조합이에요" });
  if (detail.commonInterests.length > 0) {
    const top = detail.commonInterests.slice(0, 2).join(", ");
    lines.push({ v: detail.parts.interests * w.interests + 1, text: `${top}에 관심 있는 분들이 모였어요` });
  }
  if (detail.wantedTotal > 0 && detail.wantedMet > 0) {
    lines.push({ v: detail.parts.wanted * w.wanted, text: "만나고 싶다고 한 성향의 분이 함께해요" });
  }
  if (detail.metPairs === 0) {
    lines.push({ v: detail.parts.fresh * w.fresh, text: "모두 처음 만나는 분들이에요" });
  }
  return lines
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((l) => l.text);
}
