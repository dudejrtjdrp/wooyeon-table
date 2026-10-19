// 참가자 화면에 보여줄 상태 문구. 내부 상태값은 그대로 두고 사람 말로만 바꾼다.
export type AppRow = {
  application_status: string;
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
  resolution?: string | null;
  rounds?: { match_at?: string } | null;
};

/** t(지금)를 넘기면 결제 전에 매칭 시각이 지난 신청을 '결제 전 마감'으로 보여 준다 (화면마다 '결제 대기'로 남던 문제) */
export function headline(a: AppRow, t?: Date): { label: string; tone: "muted" | "accent" | "leaf" | "ink" | "candle" | "danger"; desc: string } {
  if (a.application_status === "CANCELED") return { label: "신청 취소", tone: "muted", desc: "취소한 신청이에요." };
  if (t && a.rounds?.match_at && new Date(a.rounds.match_at) <= t && (a.payment_status === "PENDING" || a.payment_status === "FAILED"))
    return { label: "결제 전 마감", tone: "muted", desc: "결제 전에 매칭 시각이 지나 이번 테이블에는 들어가지 못했어요. 빠져나간 돈은 없어요." };
  if (a.payment_status === "PENDING") return { label: "결제 대기", tone: "candle", desc: "결제를 마쳐야 매칭 대상이 돼요." };
  if (a.payment_status === "FAILED") return { label: "결제 실패", tone: "danger", desc: "결제가 되지 않았어요. 다시 시도해 주세요." };
  if (a.payment_status === "REFUND_REQUESTED" || a.payment_status === "REFUND_PROCESSING")
    return { label: "환불 중", tone: "muted", desc: "원래 결제수단으로 환불하고 있어요." };
  if (a.payment_status === "REFUNDED") return { label: "환불 완료", tone: "muted", desc: "환불이 끝났어요." };
  if (a.payment_status === "REFUND_FAILED") return { label: "환불 다시 처리 중", tone: "candle", desc: "결제사에서 환불이 한 번에 되지 않아 10분 간격으로 자동으로 다시 시도하고 있어요. 세 번 안 되면 운영팀이 직접 처리해요. 따로 하실 일은 없어요." };
  switch (a.match_status) {
    case "WAITING":
      return { label: "매칭 대기", tone: "accent", desc: "신청 마감 뒤 자동으로 테이블을 꾸려요." };
    case "MATCHING":
      return { label: "매칭 중", tone: "accent", desc: "조건에 맞는 테이블을 찾고 있어요." };
    case "REALLOCATING":
      return { label: "재배치 중", tone: "candle", desc: "처음 테이블이 조건에 맞지 않아 다른 테이블을 찾고 있어요." };
    case "CONFIRMED":
      if (a.attendance_status === "ATTENDED") return { label: "참석 완료", tone: "leaf", desc: "함께해 주셔서 고마워요." };
      if (a.attendance_status === "NO_SHOW") return { label: "불참", tone: "muted", desc: "참석 기록이 없어요." };
      if (a.attendance_status?.startsWith("CANCELED")) return { label: "참석 취소", tone: "muted", desc: "참석을 취소했어요." };
      return { label: "매칭 확정", tone: "leaf", desc: "테이블이 정해졌어요. 단체방에서 만나요." };
    case "ALTERNATIVE_OFFERED":
      if (a.resolution === "wait") return { label: "자리 기다리는 중", tone: "candle", desc: "고른 일정에 자리가 나면 먼저 여쭤볼게요. 마감까지 자리가 없으면 이용권으로 보관해 드려요." };
      return { label: "매칭 실패", tone: "candle", desc: "이번에는 테이블을 못 만들었어요. 다른 일정으로 옮기거나 보관·환불을 골라 주세요. 결제한 금액은 그대로 남아 있어요." };
    case "TRANSFERRED":
      return { label: "일정 이동", tone: "muted", desc: "다른 일정으로 옮겼어요." };
    case "NO_MATCH":
      return { label: "매칭 종료", tone: "muted", desc: "이번 신청은 마무리됐어요." };
    case "EXCEPTION":
      return { label: "확인 중", tone: "candle", desc: "운영팀이 확인하고 있어요. 곧 알려드릴게요." };
  }
  return { label: "확인 중", tone: "muted", desc: "상태를 확인하고 있어요. 오래 그대로면 내 정보 → 자주 묻는 질문과 문의에서 '문의하기'로 알려 주세요." };
}
