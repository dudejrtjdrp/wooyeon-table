// 참가자 화면에 보여줄 상태 문구. 내부 상태값은 그대로 두고 사람 말로만 바꾼다.
export type AppRow = {
  application_status: string;
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
};

export function headline(a: AppRow): { label: string; tone: "muted" | "accent" | "leaf" | "ink" | "candle" | "danger"; desc: string } {
  if (a.application_status === "CANCELED") return { label: "신청 취소", tone: "muted", desc: "취소한 신청이에요." };
  if (a.payment_status === "PENDING") return { label: "결제 대기", tone: "candle", desc: "결제를 마쳐야 매칭 대상이 돼요." };
  if (a.payment_status === "FAILED") return { label: "결제 실패", tone: "danger", desc: "결제가 되지 않았어요. 다시 시도해 주세요." };
  if (a.payment_status === "REFUND_REQUESTED" || a.payment_status === "REFUND_PROCESSING")
    return { label: "환불 중", tone: "muted", desc: "원래 결제수단으로 환불하고 있어요." };
  if (a.payment_status === "REFUNDED") return { label: "환불 완료", tone: "muted", desc: "환불이 끝났어요." };
  switch (a.match_status) {
    case "WAITING":
      return { label: "매칭 대기", tone: "accent", desc: "신청 마감 뒤 자동으로 테이블을 꾸려요." };
    case "MATCHING":
    case "REALLOCATING":
      return { label: "테이블 찾는 중", tone: "accent", desc: "조건에 맞는 테이블을 찾고 있어요." };
    case "CONFIRMED":
      if (a.attendance_status === "ATTENDED") return { label: "참석 완료", tone: "leaf", desc: "함께해 주셔서 고마워요." };
      if (a.attendance_status === "NO_SHOW") return { label: "불참", tone: "muted", desc: "참석 기록이 없어요." };
      if (a.attendance_status?.startsWith("CANCELED")) return { label: "참석 취소", tone: "muted", desc: "참석을 취소했어요." };
      return { label: "매칭 확정", tone: "leaf", desc: "테이블이 정해졌어요. 단체방에서 만나요." };
    case "ALTERNATIVE_OFFERED":
      return { label: "다른 방법 선택", tone: "candle", desc: "이번에는 맞는 테이블이 없었어요. 다음 방법을 골라 주세요." };
    case "TRANSFERRED":
      return { label: "일정 이동", tone: "muted", desc: "다른 일정으로 옮겼어요." };
    case "NO_MATCH":
      return { label: "매칭 종료", tone: "muted", desc: "이번 신청은 마무리됐어요." };
    case "EXCEPTION":
      return { label: "확인 중", tone: "candle", desc: "운영팀이 확인하고 있어요. 곧 알려드릴게요." };
  }
  return { label: a.match_status, tone: "muted", desc: "" };
}
