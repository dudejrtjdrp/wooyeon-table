// 피드백을 다음 매칭 입력으로 바꾸는 계산 (F11 "참여가 쌓일수록 정교해진다"). DB 없이 계산해 테스트로 확인한다.
// - 같은 상대와 함께 앉았던 테이블들에 남긴 분위기·대화 점수를 평균해, 평균이 2점 이하면 그 쌍은 다음에 다시 앉을 때 점수가 깎인다(cool).
//   한 번 별로였어도 다음번에 좋았으면 평균이 올라가 신호가 풀린다. 다시 만나고 싶지 않다고 직접 고른 것(제외)과 달리 약한 신호라 제외까지는 하지 않는다.
// - 참석 횟수가 많을수록 그 사람의 후기를 더 믿는다(신뢰도 trust). 감점의 크기와 '즐거웠던 재참가자' 가점이 신뢰도에 비례한다.
// - 만족 여부는 마지막 한 번이 아니라 지금까지 남긴 후기 전체의 평균으로 본다.
// 숫자(2점·4점·3회)는 PRD에 없는 시연용 가정이다 (docs/02-matching-rules.md '시연용 가정' 표).
import { pairKey } from "./types";

export type FeedbackRow = { user_id: string; table_id: string; mood_score: number | null; talk_score: number | null; rejoin_intent: number | null; created_at?: string | null };
export type SeatRow = { user_id: string; table_id: string | null };

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** 분위기·대화 평균이 이 점수 이하면 '별로였던 테이블'로 본다 */
export const LOW_SCORE = 2;
/** 분위기·대화 평균 또는 재참여 의향이 이 점수 이상이면 '즐거웠던 사람'으로 본다 */
export const HAPPY_SCORE = 4;
/** 이만큼 참석하면 그 사람의 후기를 온전히 믿는다(신뢰도 1). 그보다 적으면 참석 횟수에 비례 */
export const TRUST_FULL_AT = 3;

/** 참석 횟수 → 후기 신뢰도(0~1). 후기를 남겼으면 적어도 한 번은 참석한 것으로 본다 */
export const trustOf = (attended: number) => Math.min(1, Math.max(1, attended) / TRUST_FULL_AT);

/** 후기 한 건의 분위기·대화 평균 */
export const moodOf = (f: FeedbackRow) => avg([f.mood_score, f.talk_score]);

export const isLow = (f: FeedbackRow) => {
  const a = moodOf(f);
  return a !== null && a <= LOW_SCORE;
};
export const isHappy = (f: FeedbackRow) => (moodOf(f) ?? 0) >= HAPPY_SCORE || (f.rejoin_intent ?? 0) >= HAPPY_SCORE;

export type History = { attended: number; happy: boolean; trust: number };

/**
 * @param feedbacks 대상자들이 남긴 후기 (여러 번 참석했으면 여러 건)
 * @param seats 그 후기 테이블에 실제로 참석한 사람들 (applications.attendance_status = ATTENDED)
 * @param attended 사람별 참석 횟수
 * @returns cool: 다시 앉으면 감점할 쌍, coolWeight: 쌍별 감점 비율(0.5~1, 후기를 남긴 사람의 신뢰도), history: 사람별 참석·만족·신뢰도
 */
export function feedbackSignals(feedbacks: FeedbackRow[], seats: SeatRow[], attended: Map<string, number>) {
  const byTable = new Map<string, string[]>();
  for (const s of seats) if (s.table_id) byTable.set(s.table_id, [...(byTable.get(s.table_id) ?? []), s.user_id]);
  const trust = (u: string) => trustOf(attended.get(u) ?? 0);

  // 쌍별(후기를 남긴 사람 → 같이 앉은 사람) 점수를 모아 평균한다
  const pairScores = new Map<string, { from: string; key: string; scores: number[] }>();
  for (const f of feedbacks) {
    const s = moodOf(f);
    if (s === null) continue;
    for (const other of byTable.get(f.table_id) ?? []) {
      if (other === f.user_id) continue;
      const id = `${f.user_id}>${other}`;
      const cur = pairScores.get(id) ?? { from: f.user_id, key: pairKey(f.user_id, other), scores: [] };
      cur.scores.push(s);
      pairScores.set(id, cur);
    }
  }
  const cool = new Set<string>();
  const coolWeight = new Map<string, number>();
  for (const p of pairScores.values()) {
    if ((avg(p.scores) ?? 5) > LOW_SCORE) continue;
    cool.add(p.key);
    // 처음 온 사람의 한 번 후기는 절반만, 세 번 이상 온 사람의 후기는 온전히 반영한다
    const w = Math.round((0.5 + 0.5 * trust(p.from)) * 100) / 100;
    coolWeight.set(p.key, Math.max(coolWeight.get(p.key) ?? 0, w));
  }

  // 만족 여부: 남긴 후기 전체의 분위기·대화 평균 또는 재참여 의향 평균
  const mine = new Map<string, FeedbackRow[]>();
  for (const f of feedbacks) mine.set(f.user_id, [...(mine.get(f.user_id) ?? []), f]);
  const happyOf = (u: string) => {
    const fs = mine.get(u);
    if (!fs?.length) return false;
    const mood = avg(fs.map(moodOf));
    const rejoin = avg(fs.map((f) => f.rejoin_intent));
    return (mood ?? 0) >= HAPPY_SCORE || (rejoin ?? 0) >= HAPPY_SCORE;
  };
  const history = new Map<string, History>();
  for (const [u, n] of attended) history.set(u, { attended: n, happy: happyOf(u), trust: trustOf(n) });
  for (const u of mine.keys()) if (!history.has(u)) history.set(u, { attended: 0, happy: happyOf(u), trust: trustOf(0) });
  return { cool, coolWeight, history, lowTables: [...new Set(feedbacks.filter(isLow).map((f) => f.table_id))] };
}
