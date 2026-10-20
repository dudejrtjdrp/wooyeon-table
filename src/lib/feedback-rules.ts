// 후기 입력 검증과 '후기 남기기' 안내 판정 (DB 없이 테스트한다)
import { canClaimAttended } from "./attendance-rules";

/** 후기 별점 다섯 개. name은 폼 이름, column은 feedbacks 열 */
export const FEEDBACK_SCORES = [
  { name: "mood", label: "테이블 분위기", column: "mood_score" },
  { name: "talk", label: "대화", column: "talk_score" },
  { name: "venue", label: "식당", column: "venue_score" },
  { name: "rejoin", label: "또 참여하고 싶음", column: "rejoin_intent" },
  { name: "recommend", label: "친구에게 추천", column: "recommend_intent" },
] as const;

export type ScoreName = (typeof FEEDBACK_SCORES)[number]["name"];
export type ScoreColumn = (typeof FEEDBACK_SCORES)[number]["column"];

export const SCORES_MISSING_MSG = "별점을 모두 골라 주세요";

const score = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/**
 * 별점 다섯 개가 모두 1~5점인지 본다. 사람 고르기·한마디는 고르지 않아도 된다.
 * 빠진 게 있으면 ok=false와 빠진 항목 이름(폼 순서대로)
 */
export function parseFeedbackScores(get: (name: string) => unknown):
  | { ok: true; scores: Record<ScoreColumn, number> }
  | { ok: false; missing: ScoreName[]; given: Partial<Record<ScoreName, number>> } {
  const missing: ScoreName[] = [];
  const given: Partial<Record<ScoreName, number>> = {};
  const scores = {} as Record<ScoreColumn, number>;
  for (const f of FEEDBACK_SCORES) {
    const v = score(get(f.name));
    if (v === null) missing.push(f.name);
    else {
      given[f.name] = v;
      scores[f.column] = v;
    }
  }
  return missing.length ? { ok: false, missing, given } : { ok: true, scores };
}

/** 후기 화면 주소 ?miss=mood,talk 를 다시 읽는다 (모르는 이름은 버린다) */
export function parseMissing(q: string | null | undefined): ScoreName[] {
  const names = new Set<string>(FEEDBACK_SCORES.map((f) => f.name));
  return (q ?? "").split(",").filter((x): x is ScoreName => names.has(x));
}

/** 후기 요청 안전망과 같은 기간: 끝난 지 7일이 지나면 홈에서 다시 권하지 않는다 */
export const FEEDBACK_ASK_DAYS = 7;

/**
 * 끝난 모임 하나에 대해 홈 맨 위에 띄울 안내.
 * - review: 체크인했고(참석) 모임이 끝났고 후기가 없다 → '후기 남기기' (pipeline askFeedback·후기 화면과 같은 조건)
 * - claim: 체크인 기록이 없지만 48시간 안이라 '참석했어요'를 알릴 수 있고 아직 안 알렸다 → 모임 정보로
 * - null: 띄울 게 없다
 */
export function afterMeetingCard(o: { attendance: string | null | undefined; ended: boolean; endsAt: Date; reviewed: boolean; claimed: boolean; t: Date }): "review" | "claim" | null {
  if (!o.ended) return null;
  if (o.attendance === "ATTENDED") {
    if (o.reviewed) return null;
    return o.t.getTime() - o.endsAt.getTime() <= FEEDBACK_ASK_DAYS * 86400_000 ? "review" : null;
  }
  return !o.claimed && canClaimAttended(o.attendance, o.endsAt, o.t) ? "claim" : null;
}
