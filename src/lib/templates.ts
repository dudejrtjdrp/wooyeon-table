// 자동 메시지 템플릿. 운영자가 어드민(자동 메시지)에서 문구를 고칠 수 있고, 비워 두면 기본 문구를 쓴다.
// {중괄호} 자리에는 발송할 때 실제 값이 들어간다.
import { hasBatchim } from "./korean";
import { fmtClock, fmtDay } from "./format";
import { db } from "./supabase";

/** 템플릿의 {date} {time} 자리. 둘을 이어 쓰면 fmtSlot과 같은 표기다: 11월 6일(금) 저녁 7:30 */
export const slotVars = (iso: string) => ({ date: fmtDay(iso), time: fmtClock(iso) });

export const TEMPLATES = {
  applied: { label: "신청 완료", when: "신청서를 낸 직후", channel: "알림함(푸시 없음)", title: "신청이 접수됐어요", body: "{round} · 결제하면 매칭에 들어가요", vars: ["round", "areas", "days", "cutoff"] },
  payment_pending: { label: "결제 대기", when: "신청 1시간 뒤에도 결제 전일 때 1회", channel: "푸시·알림함", title: "결제가 남아 있어요", body: "{deadline}까지 결제해야 매칭에 들어가요", vars: ["deadline"] },
  paid: { label: "결제 완료", when: "결제가 확인된 직후", channel: "알림함(푸시 없음)", title: "결제가 끝났어요", body: "{match_at}에 결과를 알려 드려요", vars: ["amount", "match_at"] },
  paid_membership: { label: "결제 완료(멤버십)", when: "멤버십으로 신청한 직후", channel: "알림함(푸시 없음)", title: "멤버십으로 신청했어요", body: "{match_at}에 결과를 알려 드려요", vars: ["match_at"] },
  paid_pass: { label: "결제 완료(보유 이용권)", when: "갖고 있던 이용권으로 신청한 직후", channel: "알림함(푸시 없음)", title: "이용권으로 신청했어요", body: "남은 {remaining}회 · {match_at}에 결과를 알려 드려요", vars: ["remaining", "match_at"] },
  confirmed: { label: "테이블 확정", when: "자동 매칭으로 테이블이 확정되고 식당 배정·단체방 개설까지 끝난 직후", channel: "푸시·알림함", title: "테이블이 확정됐어요", body: "{date} {time} · {region} {venue}", vars: ["date", "time", "region", "venue", "venue_info"] },
  joined: { label: "빈자리 합류", when: "매칭 실패 뒤 빈자리에 앉거나 대기 중 빈자리 제안을 받아들였을 때", channel: "알림함(푸시 없음)", title: "테이블에 합류했어요", body: "{date} {time} · {region} {venue}", vars: ["date", "time", "region", "venue"] },
  venue_set: { label: "식당 확정", when: "식당이 늦게 정해졌을 때(첫 안내에 식당이 없던 테이블)", channel: "푸시·알림함·단체방", title: "식당이 정해졌어요", body: "{date} {time} · {venue}", vars: ["date", "time", "venue", "reservation"] },
  alternative: { label: "매칭 실패", when: "재배치까지 실패한 직후", channel: "푸시·알림함", title: "이번엔 테이블이 꾸려지지 않았어요", body: "3일 안에 다음 방법을 골라 주세요", vars: ["reason", "alternatives"] },
  alternative_remind: { label: "매칭 실패 다시 알림", when: "실패 안내 2일 뒤까지 고르지 않았을 때 1회", channel: "푸시·알림함", title: "내일까지 다음 방법을 골라 주세요", body: "고르지 않으면 이번 일정은 넘겨요", vars: [] },
  reminder: { label: "하루 전 안내", when: "모임 24시간 전", channel: "푸시·알림함", title: "내일 모임, 당일 취소는 안 돼요", body: "{time} · {venue} · 예약명 '{reservation}'", vars: ["date", "time", "region", "venue", "reservation"] },
  reminder_chat: { label: "하루 전 단체방 공지", when: "모임 24시간 전", channel: "단체방", title: "", body: "내일 {time}, {region} {venue}에서 만나요. {reservation_line}\n당일 취소와 단체방 나가기는 할 수 없어요. 늦을 것 같으면 이 방의 '늦을 것 같아요'로 미리 알려 주세요. 연락 없이 오지 않으면 노쇼로 기록돼요.", vars: ["time", "region", "venue", "reservation", "reservation_line"] },
  reallocating: { label: "자동 재배치 중", when: "확정된 테이블 인원이 4명 아래로 줄었을 때 남은 분들께", channel: "알림함(푸시 없음)", title: "다른 자리를 찾고 있어요", body: "정해지면 바로 알려 드릴게요", vars: ["date", "time", "region"] },
  reallocated: { label: "자동 재배치 완료", when: "인원이 모자란 테이블에서 다른 테이블로 옮겼을 때", channel: "푸시·알림함", title: "테이블이 바뀌었어요", body: "{date} {time} · {region}", vars: ["date", "time", "region"] },
  venue_changed: { label: "식당 변경", when: "처음 식당 예약이 세 번 안 돼 같은 동네 다른 식당으로 바꿨을 때, 또는 운영자가 테이블 상세에서 식당을 바꿨을 때", channel: "푸시·알림함·단체방", title: "모임 식당이 바뀌었어요", body: "{date} {time} · {venue}", vars: ["date", "time", "venue"] },
  refund_requested: { label: "환불 요청 접수", when: "환불을 고르거나 환불 마감 전에 취소했을 때", channel: "알림함(푸시 없음)", title: "환불을 접수했어요", body: "{amount} · 끝나면 알려 드릴게요", vars: ["amount"] },
  refunded: { label: "환불 완료", when: "환불이 끝났을 때", channel: "푸시·알림함", title: "환불이 끝났어요", body: "{amount}을 돌려드렸어요", vars: ["amount"] },
  refund_retry: { label: "환불 다시 시도", when: "결제사에서 환불이 한 번 실패했을 때", channel: "알림함(푸시 없음)", title: "환불을 다시 시도하고 있어요", body: "{amount} · 따로 하실 일은 없어요", vars: ["amount"] },
  refund_failed: { label: "환불 운영팀 처리", when: "자동 환불이 세 번 실패했을 때", channel: "푸시·알림함", title: "환불은 운영팀이 처리해요", body: "{amount} · 처리되면 알려 드릴게요", vars: ["amount"] },
  checkin_nudge: { label: "체크인 안내", when: "모임 시작 20분 뒤에도 체크인하지 않은 참석 예정자에게 1회", channel: "푸시·알림함", title: "도착했다면 체크인해 주세요", body: "체크인해야 참석으로 남고 후기를 쓸 수 있어요", vars: [] },
  feedback: { label: "후기 요청", when: "모임 종료 직후 (참석자만)", channel: "푸시·알림함", title: "오늘 저녁 어땠어요?", body: "1분이면 후기를 남길 수 있어요", vars: [] },
  transferred: { label: "일정 이동 완료", when: "매칭 실패 뒤 다른 일정으로 옮긴 직후", channel: "알림함(푸시 없음)", title: "일정을 옮겼어요", body: "{round} · {match_at}에 결과를 알려 드려요", vars: ["round", "match_at"] },
  next_round: { label: "다음 모집 시작", when: "새 회차 모집이 열렸을 때 (새 일정 소식 받기에 동의한 지난 참가자)", channel: "푸시·알림함", title: "다음 식탁이 열렸어요", body: "{recommendation}", vars: ["recommendation", "deadline"] },
  round_changed: { label: "결과 안내 시각 변경", when: "운영자가 모집 중인 회차의 자동 매칭 시각을 바꿨을 때 (결제를 마친 신청자)", channel: "알림함(푸시 없음)", title: "결과 안내 시각이 바뀌었어요", body: "{round} · {match_at}에 결과를 알려 드려요", vars: ["round", "match_at"] },
  round_canceled: { label: "회차 취소", when: "운영자가 매칭 전 회차를 취소했을 때 (신청자 전원)", channel: "푸시·알림함", title: "이번 모임이 취소됐어요", body: "{round} · 결제·환불 결과는 내 신청에서 볼 수 있어요", vars: ["round"] },
  feedback_remind: { label: "후기 리마인드", when: "종료 24시간 뒤까지 후기가 없을 때 1회", channel: "푸시·알림함", title: "어제 식탁, 한 줄만 남겨 주세요", body: "남겨 주신 후기는 다음 테이블에 반영돼요", vars: [] },
  pass_granted: { label: "이용권 지급", when: "운영자가 회원 상세에서 이용권 횟수를 더했을 때 (보상·문의 처리)", channel: "푸시·알림함", title: "이용권 {count}회를 드렸어요", body: "{until}까지 다음 일정에 쓸 수 있어요", vars: ["count", "until"] },
  membership_granted: { label: "멤버십 기간 연장(운영자)", when: "운영자가 회원 상세에서 멤버십 기간을 늘렸을 때", channel: "푸시·알림함", title: "멤버십 기간을 {extra_days}일 늘렸어요", body: "{until}까지 쓸 수 있어요", vars: ["extra_days", "until"] },
  announcement: { label: "운영자 공지", when: "운영자가 자동 메시지 화면에서 회차 신청자·테이블·회원에게 공지를 보낼 때", channel: "푸시·알림함", title: "{headline}", body: "{message}", vars: ["headline", "message"] },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

/**
 * 알림은 한 줄 요약만 보내고, 눌러서 들어간 화면에서 자세히 보게 한다 (성효님 결정 2026-10-17).
 * 참가자가 방금 직접 한 일의 확인이나 '하실 일 없음' 안내는 알림함에만 남기고 휴대폰 푸시는 보내지 않는다.
 */
export const QUIET_TEMPLATES = new Set<string>([
  "applied", "paid", "paid_membership", "paid_pass", "transferred", "joined", "reallocating",
  "refund_requested", "refund_retry", "canceled", "attendance_canceled", "kept", "waiting",
  "membership_extended", "seat_offer_expired", "round_changed",
]);

/** 어드민 미리보기용 예시 값. 날짜·시각은 발송 때 fmtDay·fmtClock(fmtSlot과 같은 표기)으로 들어간다 */
export const SAMPLE_VARS: Record<string, string> = {
  date: "10월 23일(금)", time: "저녁 7:30", region: "홍대·합정·연남", venue: "홍대 둥근식탁", reservation: "우연한식탁 2032", amount: "9,900원",
  reason: "고른 일정에 4명이 모이지 않았어요.",
  round: "10월 넷째 주 저녁", areas: "홍대·합정·연남", days: "10월 23일(금)·10월 24일(토)", cutoff: "10월 20일(화) 밤 12시", deadline: "10월 20일(화) 밤 12시",
  match_at: "10월 21일(수) 오전 9시", remaining: "2", reservation_line: "예약명은 '우연한식탁 2032'예요.",
  venue_info: "",
  count: "1", until: "12월 18일(금)", extra_days: "7", headline: "이번 주 모임 장소 안내", message: "식당 입구가 공사 중이라 옆문으로 들어와 주세요",
  recommendation: "늘 오시던 금요일 홍대·합정·연남 · 10월 30일(금) 저녁 7:30", alternatives: "옮길 수 있는 일정: 10월 다섯째 주 저녁(10월 30일(금)·10월 31일(토), 홍대·합정·연남·강남·역삼·선릉). ",
};

/** 단체방 하루 전 공지의 {reservation_line}. 식당이 아직 없으면 예약명 대신 모임 정보 안내 */
export const reservationLine = (reservation: string | null | undefined) =>
  reservation ? `예약명은 '${reservation}'${hasBatchim(reservation) ? "이에요" : "예요"}.` : "식당과 예약명은 모임 정보에서 확인해 주세요.";

/** 확정 알림의 {venue_info}. 식당이 정해졌으면 예약명, 아직이면 언제 알려 주는지 */
export const venueInfo = (venue: string | null | undefined, reservation: string | null | undefined) =>
  venue ? `예약명은 '${reservation ?? "우연한식탁"}'${hasBatchim(reservation ?? "우연한식탁") ? "이에요" : "예요"}. 주소와 지도는 모임 정보에서 볼 수 있어요. ` : "식당은 정해지는 대로 단체방과 알림으로 알려 드릴게요. ";

export async function loadTemplates(): Promise<Record<string, { title?: string; body?: string }>> {
  const { data } = await db().from("settings").select("value").eq("key", "msg.templates").maybeSingle();
  return (data?.value as Record<string, { title?: string; body?: string }>) ?? {};
}

// 빈 값이 들어간 자리의 공백은 정리한다 ("홍대 {venue}." → 식당이 아직 없으면 "홍대.")
const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "").replace(/ · 예약명 ''/g, "").replace(/( · )+(?= · |$)/g, "").replace(/ +(에서|[.,])/g, "$1").replace(/ {2,}/g, " ").replace(/[ ·]+$/, "").trim();

/** 템플릿을 실제 문구로. overrides는 loadTemplates() 결과(여러 번 보낼 때 한 번만 읽으려고 받는다) */
export function render(key: TemplateKey, vars: Record<string, string>, overrides: Record<string, { title?: string; body?: string }> = {}) {
  const d = TEMPLATES[key];
  const o = overrides[key] ?? {};
  return { title: fill(o.title?.trim() || d.title, vars), body: fill(o.body?.trim() || d.body, vars) };
}
