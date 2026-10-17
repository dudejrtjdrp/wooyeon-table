// 체크인 관련 시간 판정 (DB 없이 테스트한다). 값은 PRD에 없는 운영 판단이다 (2026-10-18, 100명 시뮬레이션)

/** 모임 시작 뒤 이만큼 지나도 체크인이 없으면 한 번 알린다 */
export const CHECKIN_NUDGE_AFTER = 20 * 60_000;
/** 체크인을 깜빡한 사람이 '참석했어요'라고 알릴 수 있는 기간 (모임 끝난 뒤) */
export const CLAIM_WINDOW = 48 * 3600_000;

export const shouldNudgeCheckIn = (start: Date, end: Date, t: Date) => t.getTime() >= start.getTime() + CHECKIN_NUDGE_AFTER && t < end;
export const canClaimAttended = (status: string | null | undefined, end: Date, t: Date) =>
  status === "SCHEDULED" && t > end && t.getTime() <= end.getTime() + CLAIM_WINDOW;

/** 매칭 실패 시각: 감사 로그(실제 시각)와 그 회차 매칭 시각 중 늦은 쪽. 시연용 시계를 앞당겨도 실패 직후 바로 기한이 지나지 않게 */
export const failureMoment = (logged: Date, matchAt?: string | null) => (matchAt && new Date(matchAt) > logged ? new Date(matchAt) : logged);

/** 본인이 '참석했는데 체크인을 못 했어요'라고 알린 노쇼 후보를 사유 문장에서 알아보는 표시 (화면 세 곳이 같은 값을 쓴다) */
export const CLAIM_MARK = "체크인을 못 했어요";
export const isClaimed = (reason: string | null | undefined) => (reason ?? "").includes(CLAIM_MARK);
