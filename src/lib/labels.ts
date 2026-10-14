// 운영자 화면에 보여줄 상태 이름. 내부 값은 그대로 두고 표시만 바꾼다.
type Tone = "muted" | "accent" | "leaf" | "ink" | "candle" | "danger";

export const PAYMENT: Record<string, [string, Tone]> = {
  PENDING: ["결제 대기", "candle"],
  PAID: ["결제 완료", "leaf"],
  FAILED: ["결제 실패", "danger"],
  REFUND_AVAILABLE: ["환불 가능", "candle"],
  REFUND_REQUESTED: ["환불 요청", "candle"],
  REFUND_PROCESSING: ["환불 중", "candle"],
  REFUNDED: ["환불 완료", "muted"],
  REFUND_FAILED: ["환불 실패", "danger"],
};

export const MATCH: Record<string, [string, Tone]> = {
  WAITING: ["매칭 대기", "accent"],
  MATCHING: ["매칭 중", "accent"],
  REALLOCATING: ["재배치 중", "accent"],
  CONFIRMED: ["확정", "leaf"],
  ALTERNATIVE_OFFERED: ["대안 선택 대기", "candle"],
  TRANSFERRED: ["일정 이동", "muted"],
  NO_MATCH: ["종료", "muted"],
  EXCEPTION: ["예외", "danger"],
};

export const ATTEND: Record<string, [string, Tone]> = {
  SCHEDULED: ["참석 예정", "accent"],
  ATTENDED: ["참석", "leaf"],
  CANCELED_EARLY: ["사전 취소", "muted"],
  CANCELED_LATE: ["늦은 취소", "candle"],
  NO_SHOW: ["노쇼", "danger"],
};

export const ACCOUNT: Record<string, [string, Tone]> = {
  active: ["정상", "leaf"],
  warned: ["경고", "candle"],
  restricted: ["참가 제한", "danger"],
  banned: ["영구 제한", "danger"],
};

export const APP_STATUS: Record<string, [string, Tone]> = {
  DRAFT: ["작성 중", "muted"],
  SUBMITTED: ["제출", "accent"],
  CANCELED: ["취소", "muted"],
};

export const FIELD: Record<string, string> = {
  application_status: "신청",
  payment_status: "결제",
  match_status: "매칭",
  attendance_status: "참석",
  status: "상태",
  account_status: "계정",
};

export const RESOLUTION: Record<string, string> = { transfer: "일정 이동", keep_pass: "이용권 보관", refund: "환불" };

export const label = (map: Record<string, [string, Tone]>, v: string | null | undefined): [string, Tone] =>
  v ? map[v] ?? [v, "muted"] : ["-", "muted"];
