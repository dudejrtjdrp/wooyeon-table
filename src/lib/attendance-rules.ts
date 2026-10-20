// 체크인 관련 시간 판정 (DB 없이 테스트한다). 값은 PRD에 없는 운영 판단이다 (2026-10-18, 100명 시뮬레이션)

/** 모임 시작 뒤 이만큼 지나도 체크인이 없으면 한 번 알린다 */
export const CHECKIN_NUDGE_AFTER = 20 * 60_000;
/** 체크인을 깜빡한 사람이 '참석했어요'라고 알릴 수 있는 기간 (모임 끝난 뒤) */
export const CLAIM_WINDOW = 48 * 3600_000;

/** 체크인을 열어 두는 시간: 시작 이만큼 전부터 끝날 때까지 (FDB-01) */
export const CHECKIN_OPEN_BEFORE = 60 * 60_000;
/** 지금 체크인할 수 있는 시간인지 (모임 정보·홈·체크인 처리가 같은 기준) */
export const checkInOpen = (start: Date, end: Date, t: Date) => t.getTime() >= start.getTime() - CHECKIN_OPEN_BEFORE && t.getTime() <= end.getTime();

export const shouldNudgeCheckIn = (start: Date, end: Date, t: Date) => t.getTime() >= start.getTime() + CHECKIN_NUDGE_AFTER && t < end;
export const canClaimAttended = (status: string | null | undefined, end: Date, t: Date) =>
  status === "SCHEDULED" && t > end && t.getTime() <= end.getTime() + CLAIM_WINDOW;

/** 매칭 실패 시각: 감사 로그(실제 시각)와 그 회차 매칭 시각 중 늦은 쪽. 시연용 시계를 앞당겨도 실패 직후 바로 기한이 지나지 않게 */
export const failureMoment = (logged: Date, matchAt?: string | null) => (matchAt && new Date(matchAt) > logged ? new Date(matchAt) : logged);

/** 본인이 '참석했는데 체크인을 못 했어요'라고 알린 노쇼 후보를 사유 문장에서 알아보는 표시 (화면 세 곳이 같은 값을 쓴다) */
export const CLAIM_MARK = "체크인을 못 했어요";
export const isClaimed = (reason: string | null | undefined) => (reason ?? "").includes(CLAIM_MARK);

/**
 * 끝난 모임에서 참석 확인·후기 안내 한 줄. 신청 상세·후기 화면이 같은 문장을 쓴다(모임 정보 화면의 버튼과 맞게).
 * - 체크인함: 후기 남기기
 * - 체크인 없음, 알릴 수 있는 기한 안, 아직 안 알림: 모임 정보에서 알려 달라
 * - 이미 알림: 운영팀 확인 중
 * - 기한 지남: 후기는 못 남기고 문의하기로
 */
export function afterMeetingNote(o: { attended: boolean; canClaim: boolean; claimed: boolean; status?: string | null }): { text: string; contact: boolean } {
  if (o.attended) return { text: "모임이 끝났어요. 후기는 '모임 정보 보기'에서 남길 수 있어요.", contact: false };
  // 알렸어도 운영자가 이미 노쇼로 정했으면 '확인 중'이 아니다(참석 예정으로 남아 있을 때만 확인 중)
  if (o.claimed && (o.status ?? "SCHEDULED") === "SCHEDULED") return { text: "참석했다고 알려 주셨어요. 운영팀이 확인하면 후기를 남길 수 있어요.", contact: false };
  if (o.canClaim) return { text: "체크인 기록이 없어요. 참석했다면 '모임 정보 보기'에서 '참석했는데 체크인을 못 했어요'를 눌러 주세요.", contact: false };
  return { text: "체크인 기록이 없어 후기는 남길 수 없어요. 참석했다면 문의하기로 알려 주세요.", contact: true };
}
