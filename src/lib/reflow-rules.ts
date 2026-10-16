// 확정 뒤 인원이 4명 아래로 줄어든 테이블의 재배치 판단 (PRD 15장 '확정 후 1명 취소', Q10). DB 없이 계산해 테스트로 확인한다.
// 원칙(성효님 결정 2026-10-16): 필수 조건은 낮추지 않는다. 대기자 충원이 먼저고(attendance.ts fillOrReflow),
// 그래도 모자라면 남은 사람을 본인이 고른 일정의 다른 확정 테이블로만 옮긴다. 옮길 곳이 없으면 매칭 실패 화면으로(참가자가 고름).
import { canJoin } from "./matching/constraints";
import { scoreGroup } from "./matching/score";
import { type TierSlot, reallocTier } from "./matching/tiers";
import type { Candidate, Gender, MatchSettings, Relations } from "./matching/types";

export type ReflowMember = {
  id: string;
  userId: string;
  birthYear: number;
  slotIds: string[];
  /** 점수 재검사용 프로필. 비어 있으면 중간값으로 본다 */
  gender?: Gender;
  mbti?: string | null;
  interests?: string[];
  myTraits?: string[];
  wantedTraits?: string[];
};
export type ReflowTarget = { id: string; slotId: string; startsAt: string; region: string; members: ReflowMember[] };
/** targetId가 null이면 옮길 곳이 없어 ALTERNATIVE_OFFERED로 간다 */
export type ReflowMove = { appId: string; targetId: string | null };

/** 모임까지 이만큼 안 남은 테이블로는 옮기지 않는다 (새 단체방·식당을 확인할 시간). 시연용 가정(팀이 정한 값) */
export const REFLOW_MIN_LEAD = 24 * 3600_000;

export const toCandidate = (m: ReflowMember): Candidate => ({
  applicationId: m.id,
  userId: m.userId,
  birthYear: m.birthYear,
  gender: m.gender ?? "M",
  mbti: m.mbti ?? null,
  interests: m.interests ?? [],
  myTraits: m.myTraits ?? [],
  wantedTraits: m.wantedTraits ?? [],
  slotIds: m.slotIds,
});

/**
 * 남은 사람마다 옮길 테이블을 고른다. 인원이 최소 인원 이상이면 아무것도 하지 않는다(빈 배열).
 * - 본인이 신청 때 고른 일정(slotIds)의 테이블만 본다. 고르지 않은 날짜·동네로는 넘기지 않는다
 * - 나이 차·차단·신고·비선호 조건은 엔진과 같은 canJoin으로 다시 본다(완화 없음)
 * - 옮긴 뒤 테이블 점수(scoreGroup().gate)가 운영자가 정한 최소 점수 이상이어야 한다(엔진 자동 확정 기준과 같음)
 * - 정원(최대 인원)을 넘기지 않는다
 * - 순서는 PRD 7.4(엔진과 같은 reallocTier): 같은 날짜·같은 지역 → 같은 날짜·다른 지역 → 다른 날짜·같은 지역 → 다른 날짜·다른 지역.
 *   같은 순위 안에서는 옮긴 뒤 총점이 높은 테이블, 그다음 이른 모임
 */
export function planReflow(members: ReflowMember[], targets: ReflowTarget[], rel: Relations, settings: MatchSettings, source: TierSlot, at: Date): ReflowMove[] {
  if (members.length >= settings.minSize) return [];
  const pool = targets
    .filter((t) => new Date(t.startsAt).getTime() - at.getTime() > REFLOW_MIN_LEAD)
    .map((t) => ({ ...t, members: [...t.members], tier: reallocTier(source, t).tier }));
  return members.map((m) => {
    const me = toCandidate(m);
    const options = pool
      .filter((t) => m.slotIds.includes(t.slotId) && t.members.length < settings.maxSize && canJoin(t.members.map(toCandidate), me, rel, settings))
      .map((t) => ({ t, score: scoreGroup([...t.members.map(toCandidate), me], rel, settings) }))
      .filter((o) => o.score.gate >= settings.minScore)
      .sort((x, y) => x.t.tier - y.t.tier || y.score.total - x.score.total || x.t.startsAt.localeCompare(y.t.startsAt) || x.t.id.localeCompare(y.t.id));
    const target = options[0]?.t;
    if (!target) return { appId: m.id, targetId: null };
    target.members.push(m);
    return { appId: m.id, targetId: target.id };
  });
}
