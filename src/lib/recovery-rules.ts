// 복구 판정 기준 시각. 기록 시각(match_runs.started_at, dining_tables.confirmed_at)은 시연 시계(now())로 찍히므로
// 비교도 반드시 같은 시연 시계 t로 한다. 실제 시각(Date.now())과 섞으면 시계를 앞당긴 시연에서 복구가 멈춘다
export const RESUME_GRACE_MS = 2 * 60_000;
export const STUCK_RUN_MS = 10 * 60_000;
const RECENT_MS = 7 * 86400_000;

/** 막 확정돼 러너가 아직 안내 중일 수 있는 테이블인가 (2분 유예) */
export function justConfirmed(confirmedAt: string | null, t: Date): boolean {
  return !!confirmedAt && Date.parse(confirmedAt) > t.getTime() - RESUME_GRACE_MS;
}

/** 멈춘 실행으로 볼 기준(stuckBefore)과 복구 대상 범위(recent) */
export function runCutoffs(t: Date): { stuckBefore: string; recent: string } {
  return { stuckBefore: new Date(t.getTime() - STUCK_RUN_MS).toISOString(), recent: new Date(t.getTime() - RECENT_MS).toISOString() };
}
