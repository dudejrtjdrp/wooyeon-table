// 운영자 화면에 보여줄 상태 이름. 내부 값은 그대로 두고 표시만 바꾼다.
import { fmtDateTime } from "./format";

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

export const TABLE: Record<string, [string, Tone]> = {
  DRAFT: ["구성 중", "muted"],
  CONFIRMED: ["자동 확정", "accent"],
  VENUE_ASSIGNED: ["식당 배정", "accent"],
  READY: ["안내 완료", "leaf"],
  IN_PROGRESS: ["모임 중", "accent"],
  DONE: ["모임 끝", "muted"],
  DISSOLVED: ["해제", "danger"],
};

// 상태 이력(status_events.field)을 운영자가 읽는 말로. 여기에 없는 값은 '기타 변경'으로 보여 영문 키가 화면에 나오지 않게 한다
export const FIELD: Record<string, string> = {
  application_status: "신청",
  payment_status: "결제",
  match_status: "매칭",
  attendance_status: "참석",
  status: "상태",
  account_status: "계정",
  membership_extend: "멤버십 기한 연장",
  expires_at: "이용 기한",
  table_id: "테이블 이동",
  member_in: "합류",
  member_out: "빠짐",
  member: "빈자리 합류",
  merged_from: "테이블 병합",
  split_to: "테이블 분리",
  seat_offer: "빈자리 제안",
  resolution: "실패 후 선택",
  feedback: "후기",
  late: "늦을 것 같아요",
  push: "푸시 발송",
  resend: "다시 보내기",
  system_message: "단체방 공지",
  attempt: "예약 시도",
  content: "대화 콘텐츠",
  active: "노출",
  created: "등록",
  exception: "예외 처리",
  tables_available: "식당 재고(받을 수 있는 테이블)",
  admin_level: "운영자 권한",
  admin_account: "운영자 계정",
  admin_active: "계정 사용",
  password_reset: "비밀번호",
  csv_export: "CSV 내려받기",
  edit: "고침",
  import: "엑셀로 넣기",
  photo: "사진",
  venue_id: "식당",
  match_run: "매칭 실행",
};
export const fieldLabel = (f: string) => FIELD[f] ?? (f.startsWith("template:") ? "자동 메시지 문구" : f.includes(".") ? "설정" : "기타 변경");

export const RESOLUTION: Record<string, string> = { transfer: "일정 이동", keep_pass: "이용권 보관", refund: "환불", wait: "자리 기다리는 중" };

export const label = (map: Record<string, [string, Tone]>, v: string | null | undefined): [string, Tone] =>
  v ? map[v] ?? [v, "muted"] : ["-", "muted"];

// 상태 이력 값. 필드별 표를 먼저 보고, 없으면 공통 값(SENT 등), 날짜, id 순으로 읽기 쉽게 바꾼다
const COMMON_VALUE: Record<string, string> = {
  SENT: "성공", FAILED: "실패", SUBMITTED: "제출", OFFERED: "제안", ACCEPTED: "수락", DECLINED: "거절", EXPIRED: "기한 지남", VOID: "무효",
  JOINED: "합류", REQUESTED: "요청", CONFIRMED: "확정", CANCELED: "취소", updated: "수정", created: "등록", true: "켬", false: "끔",
  pending: "보내는 중", sent: "보냄", failed: "실패", full: "전체 권한", viewer: "조회 전용", reset: "초기화", uploaded: "올림",
};
const VALUE_MAPS: Record<string, Record<string, [string, Tone]>> = {
  payment_status: PAYMENT, match_status: MATCH, attendance_status: ATTEND, account_status: ACCOUNT, application_status: APP_STATUS,
};
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 이력 값 하나. entity가 dining_table이면 status는 테이블 상태표로 읽는다 */
export function eventValue(field: string, v: string | null | undefined, entity?: string): string {
  if (v === null || v === undefined || v === "") return "없음";
  if (field === "status" && entity === "dining_table") return TABLE[v]?.[0] ?? COMMON_VALUE[v] ?? v;
  const m = VALUE_MAPS[field]?.[v] ?? (field === "status" ? TABLE[v] ?? MATCH[v] : undefined);
  if (m) return m[0];
  if (field === "resolution") return RESOLUTION[v] ?? v;
  if (COMMON_VALUE[v]) return COMMON_VALUE[v];
  if (ISO.test(v)) return fmtDateTime(v);
  if (UUID.test(v)) return `#${v.slice(0, 6)}`;
  return v;
}

/** "멤버십 기한 연장 10월 30일(금) 밤 12시 → 11월 6일(금) 밤 12시" 같은 한 줄 */
export function eventText(e: { field: string; from_value: string | null; to_value: string; entity_type?: string }) {
  const f = fieldLabel(e.field);
  const to = eventValue(e.field, e.to_value, e.entity_type);
  return e.from_value ? `${f} ${eventValue(e.field, e.from_value, e.entity_type)} → ${to}` : `${f} ${to}`;
}

/** 이력의 주체: system → 자동, admin:<id> → 운영자(이름을 알면 이름) */
export function actorLabel(actor: string, names?: Map<string, string>) {
  if (actor === "system") return "자동";
  if (actor === "admin:demo") return "시연 도구";
  if (actor.startsWith("admin:")) return names?.get(actor.slice(6)) ? `운영자 ${names.get(actor.slice(6))}` : "운영자";
  if (actor.startsWith("user:")) return "참가자";
  return actor;
}

/** 출생연도 대신 보여 줄 연령대: 20대 후반 */
export function ageBand(birthYear: number | null | undefined, year: number) {
  if (!birthYear) return "-";
  const age = year - birthYear;
  if (age < 20) return "10대";
  const r = age % 10;
  return `${Math.floor(age / 10) * 10}대 ${r <= 3 ? "초반" : r <= 6 ? "중반" : "후반"}`;
}

// 알림 종류(notifications.template). 운영자가 문구를 고치는 템플릿 말고도 자동으로 나가는 알림이 많아서 이름을 모두 둔다
export const NOTICE: Record<string, string> = {
  applied: "신청 접수", paid: "결제 완료", payment_pending: "결제 대기", waiting: "매칭 대기", confirmed: "테이블 확정",
  reallocating: "재배치 중", reallocated: "테이블 변경", alternative: "매칭 실패", alternative_remind: "매칭 실패 다시 알림",
  transferred: "일정 이동", kept: "이용권 보관", refunded: "환불 완료", refund_failed: "환불 실패", canceled: "신청 취소",
  attendance_canceled: "참석 취소", reminder: "하루 전 안내", venue_changed: "식당 변경", seat_offer: "빈자리 제안",
  seat_offer_expired: "빈자리 제안 만료", feedback: "후기 요청", feedback_remind: "후기 리마인드", next_round: "다음 일정 추천",
  membership_extended: "멤버십 기한 연장", noshow_warn: "노쇼 경고", noshow_restrict: "노쇼 신청 제한", admin_removed: "운영자 제외",
  region_open: "동네 열림",
};
