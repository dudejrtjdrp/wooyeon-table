// 자동 메시지 템플릿. 운영자가 어드민(자동 메시지)에서 문구를 고칠 수 있고, 비워 두면 기본 문구를 쓴다.
// {중괄호} 자리에는 발송할 때 실제 값이 들어간다.
import { fmtClock, fmtDay } from "./format";
import { db } from "./supabase";

/** 템플릿의 {date} {time} 자리. 둘을 이어 쓰면 fmtSlot과 같은 표기다: 11월 6일(금) 저녁 7:30 */
export const slotVars = (iso: string) => ({ date: fmtDay(iso), time: fmtClock(iso) });

export const TEMPLATES = {
  applied: { label: "신청 완료", when: "신청서를 낸 직후", channel: "푸시·알림함", title: "신청이 접수됐어요", body: "{round} 신청을 받았어요. 고른 동네는 {areas}, 날짜는 {days}이에요. 결제를 마치면 매칭 대상이 돼요. 동네나 날짜를 바꾸고 싶으면 내 신청 화면에서 취소하고 다시 신청해 주세요. 취소는 {cutoff}까지 할 수 있어요.", vars: ["round", "areas", "days", "cutoff"] },
  payment_pending: { label: "결제 대기", when: "신청 1시간 뒤에도 결제 전일 때 1회", channel: "푸시·알림함", title: "결제를 마쳐야 매칭에 들어가요", body: "{deadline}까지 결제해 주세요. 카드, 카카오페이, 네이버페이, 토스페이로 낼 수 있어요. 마음이 바뀌었다면 내 신청 화면에서 바로 취소할 수 있어요.", vars: ["deadline"] },
  paid: { label: "결제 완료", when: "결제가 확인된 직후", channel: "푸시·알림함", title: "결제가 끝났어요", body: "{amount} 결제를 확인했어요. {match_at}에 자동으로 테이블을 꾸려서 알려 드릴게요.", vars: ["amount", "match_at"] },
  paid_membership: { label: "결제 완료(멤버십)", when: "멤버십으로 신청한 직후", channel: "푸시·알림함", title: "멤버십으로 신청했어요", body: "멤버십 기간 안에는 횟수 제한 없이 신청할 수 있어요. {match_at}에 자동으로 테이블을 꾸려서 알려 드릴게요.", vars: ["match_at"] },
  paid_pass: { label: "결제 완료(보유 이용권)", when: "갖고 있던 이용권으로 신청한 직후", channel: "푸시·알림함", title: "이용권으로 신청했어요", body: "이용권 1회를 썼어요. 남은 횟수는 {remaining}회예요. {match_at}에 자동으로 테이블을 꾸려서 알려 드릴게요.", vars: ["remaining", "match_at"] },
  confirmed: { label: "테이블 확정", when: "자동 매칭으로 테이블이 확정되고 식당 배정·단체방 개설까지 끝난 직후", channel: "푸시·알림함", title: "테이블이 확정됐어요", body: "{date} {time} {region} {venue}에서 만나요. {venue_info}단체방이 열렸으니 함께할 분들과 인사를 나눠 보세요.", vars: ["date", "time", "region", "venue", "venue_info"] },
  joined: { label: "빈자리 합류", when: "매칭 실패 뒤 빈자리에 앉거나 대기 중 빈자리 제안을 받아들였을 때", channel: "푸시·알림함", title: "테이블에 합류했어요", body: "{date} {time} {region} {venue}에서 만나요. 단체방에서 인사를 나눠 보세요.", vars: ["date", "time", "region", "venue"] },
  venue_set: { label: "식당 확정", when: "식당이 늦게 정해졌을 때(첫 안내에 식당이 없던 테이블)", channel: "푸시·알림함·단체방", title: "식당이 정해졌어요", body: "{date} {time} 모임 식당은 {venue}예요. 예약명은 '{reservation}'이고, 주소와 지도는 테이블 화면에서 볼 수 있어요.", vars: ["date", "time", "venue", "reservation"] },
  alternative: { label: "매칭 실패", when: "재배치까지 실패한 직후", channel: "푸시·알림함", title: "이번에는 맞는 테이블이 없었어요", body: "{reason} {alternatives}빈자리에 앉거나, 다른 일정으로 옮기거나, 자리가 나길 기다릴 수 있어요(1회권은 보관·환불도 가능, 멤버십은 기간 7일 연장). 3일 안에 고르지 않으면 이번 일정은 넘긴 것으로 하고 1회권은 이용권으로 보관해 드려요.", vars: ["reason", "alternatives"] },
  alternative_remind: { label: "매칭 실패 다시 알림", when: "실패 안내 2일 뒤까지 고르지 않았을 때 1회", channel: "푸시·알림함", title: "내일까지 다음 방법을 골라 주세요", body: "고르지 않으면 내일 이번 일정은 넘긴 것으로 할게요(1회권은 이용권으로 보관, 금액은 그대로). 빈자리에 앉거나 다른 일정으로 옮기거나, 자리가 나길 기다릴 수도 있어요.", vars: [] },
  reminder: { label: "하루 전 안내", when: "모임 24시간 전", channel: "푸시·알림함", title: "내일 저녁 약속 잊지 마세요", body: "{date} {time}, {region} {venue}. 예약명은 '{reservation}'이에요. 당일 취소는 할 수 없고, 연락 없이 오지 않으면 노쇼로 기록돼 다음 신청이 제한될 수 있어요.", vars: ["date", "time", "region", "venue", "reservation"] },
  reminder_chat: { label: "하루 전 단체방 공지", when: "모임 24시간 전", channel: "단체방", title: "", body: "내일 {time}, {region} {venue}에서 만나요. 예약명은 '{reservation}'이에요.\n당일 취소와 단체방 나가기는 할 수 없어요. 늦을 것 같으면 이 방의 '늦을 것 같아요'로 미리 알려 주세요. 연락 없이 오지 않으면 노쇼로 기록돼요.", vars: ["time", "region", "venue", "reservation"] },
  reallocating: { label: "자동 재배치 중", when: "확정된 테이블 인원이 4명 아래로 줄었을 때 남은 분들께", channel: "푸시·알림함", title: "다른 자리를 찾고 있어요", body: "{date} {time} {region} 테이블에서 한 분이 빠져 인원이 모자라졌어요. 기다리는 분께 빈자리를 먼저 여쭤보고, 안 되면 고르신 일정 안에서 다른 테이블을 찾아 드릴게요. 지금은 하실 일이 없어요. 정해지면 바로 알려 드릴게요.", vars: ["date", "time", "region"] },
  reallocated: { label: "자동 재배치 완료", when: "인원이 모자란 테이블에서 다른 테이블로 옮겼을 때", channel: "푸시·알림함", title: "테이블이 바뀌었어요", body: "함께하기로 한 분이 빠져 {date} {time} {region} 테이블로 옮겨 드렸어요. 새 단체방에서 인사를 나눠 보세요. 이 테이블이 마음에 들지 않으면 내 신청 화면의 '다른 방법 고르기'에서 다른 일정으로 옮기거나 이번 일정을 넘길 수 있어요.", vars: ["date", "time", "region"] },
  venue_changed: { label: "식당 변경", when: "처음 식당 예약이 세 번 안 돼 같은 동네 다른 식당으로 바꿨을 때", channel: "푸시·알림함·단체방", title: "모임 식당이 바뀌었어요", body: "{date} {time} 모임 식당이 {venue}(으)로 바뀌었어요. 처음 정한 식당에 예약이 되지 않아 같은 동네 다른 식당으로 잡았어요. 시간과 예약명은 그대로예요.", vars: ["date", "time", "venue"] },
  refund_requested: { label: "환불 요청 접수", when: "환불을 고르거나 환불 마감 전에 취소했을 때", channel: "푸시·알림함", title: "환불 요청을 받았어요", body: "{amount}을 결제하신 수단으로 돌려드리고 있어요. 끝나면 다시 알려 드릴게요. 따로 하실 일은 없어요.", vars: ["amount"] },
  refunded: { label: "환불 완료", when: "환불이 끝났을 때", channel: "푸시·알림함", title: "환불이 끝났어요", body: "{amount}을 결제하신 수단으로 돌려드렸어요. 카드사에 따라 실제로 들어오기까지 며칠 걸릴 수 있어요.", vars: ["amount"] },
  refund_retry: { label: "환불 다시 시도", when: "결제사에서 환불이 한 번 실패했을 때", channel: "푸시·알림함", title: "환불을 다시 시도하고 있어요", body: "결제사에서 {amount} 환불이 한 번에 되지 않았어요. 10분 뒤 자동으로 다시 시도할게요. 따로 하실 일은 없어요.", vars: ["amount"] },
  refund_failed: { label: "환불 운영팀 처리", when: "자동 환불이 세 번 실패했을 때", channel: "푸시·알림함", title: "환불은 운영팀이 직접 처리할게요", body: "{amount} 자동 환불이 세 번 되지 않아 운영팀이 직접 확인하고 있어요. 처리되면 바로 알려 드릴게요. 따로 하실 일은 없어요.", vars: ["amount"] },
  feedback: { label: "후기 요청", when: "모임 종료 직후 (참석자만)", channel: "푸시·알림함", title: "오늘 저녁 어떠셨어요?", body: "1분이면 끝나요. 남겨 주신 후기는 다음 매칭에 반영돼요. 불편한 일이 있었다면 후기 화면 맨 아래 '불편한 일이 있었나요?'에서 신고해 주세요. 상대에게는 알리지 않아요.", vars: [] },
  transferred: { label: "일정 이동 완료", when: "매칭 실패 뒤 다른 일정으로 옮긴 직후", channel: "푸시·알림함", title: "일정을 옮겼어요", body: "{round}로 옮겼어요. 결제는 그대로 유지되고, {match_at}에 자동으로 테이블을 꾸려요.", vars: ["round", "match_at"] },
  next_round: { label: "다음 모집 시작", when: "새 회차 모집이 열렸을 때 (새 일정 소식 받기에 동의한 지난 참가자)", channel: "푸시·알림함", title: "다음 식탁이 열렸어요", body: "{recommendation} 신청은 {deadline}까지 받아요.", vars: ["recommendation", "deadline"] },
  feedback_remind: { label: "후기 리마인드", when: "종료 24시간 뒤까지 후기가 없을 때 1회", channel: "푸시·알림함", title: "어제 식탁, 한 줄만 남겨 주세요", body: "누구와 또 만나고 싶은지 알려 주시면 다음 테이블을 더 잘 꾸릴 수 있어요.", vars: [] },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

/** 어드민 미리보기용 예시 값. 날짜·시각은 발송 때 fmtDay·fmtClock(fmtSlot과 같은 표기)으로 들어간다 */
export const SAMPLE_VARS: Record<string, string> = {
  date: "10월 23일(금)", time: "저녁 7:30", region: "홍대·합정·연남", venue: "홍대 둥근식탁", reservation: "우연한식탁 2032", amount: "9,900원",
  reason: "고른 일정에 4명이 모이지 않았어요.",
  round: "10월 넷째 주 저녁", areas: "홍대·합정·연남", days: "10월 23일(금)·10월 24일(토)", cutoff: "10월 20일(화) 밤 12시", deadline: "10월 20일(화) 밤 12시",
  match_at: "10월 21일(수) 오전 9시", remaining: "2",
  venue_info: "예약명은 '우연한식탁 2032'이에요. 주소와 지도는 테이블 화면에서 볼 수 있어요. ",
  recommendation: "자주 오신 금요일 홍대·합정·연남 일정이 열렸어요. 10월 30일(금) 저녁 7:30, 이번에도 어때요?", alternatives: "옮길 수 있는 일정: 10월 다섯째 주 저녁(10월 30일(금)·10월 31일(토), 홍대·합정·연남·강남·역삼·선릉). ",
};

/** 확정 알림의 {venue_info}. 식당이 정해졌으면 예약명, 아직이면 언제 알려 주는지 */
export const venueInfo = (venue: string | null | undefined, reservation: string | null | undefined) =>
  venue ? `예약명은 '${reservation ?? "우연한식탁"}'이에요. 주소와 지도는 테이블 화면에서 볼 수 있어요. ` : "식당은 정해지는 대로 단체방과 알림으로 알려 드릴게요. ";

export async function loadTemplates(): Promise<Record<string, { title?: string; body?: string }>> {
  const { data } = await db().from("settings").select("value").eq("key", "msg.templates").maybeSingle();
  return (data?.value as Record<string, { title?: string; body?: string }>) ?? {};
}

// 빈 값이 들어간 자리의 공백은 정리한다 ("홍대 {venue}." → 식당이 아직 없으면 "홍대.")
const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "").replace(/ +(에서|[.,])/g, "$1").replace(/ {2,}/g, " ");

/** 템플릿을 실제 문구로. overrides는 loadTemplates() 결과(여러 번 보낼 때 한 번만 읽으려고 받는다) */
export function render(key: TemplateKey, vars: Record<string, string>, overrides: Record<string, { title?: string; body?: string }> = {}) {
  const d = TEMPLATES[key];
  const o = overrides[key] ?? {};
  return { title: fill(o.title?.trim() || d.title, vars), body: fill(o.body?.trim() || d.body, vars) };
}
