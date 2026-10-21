// 심사 투어: 처음 쓰는 사람이 순서대로 버튼 하나씩만 누르면 한 회차의 처음부터 다음 회차까지 볼 수 있게.
// 지금 어느 단계인지는 DB 상태와 시연 시계로 계산한다(따로 '진행 단계'를 저장하지 않는다). DB 없이 계산만 하는 파일

export const TOUR_KEY = "demo.tour";
/** 이만큼 결제 완료 신청이 모이면 '참가자 모으기'를 마친 것으로 본다 */
export const TOUR_MIN_PAID = 8;

export type TourStepKey = "start" | "gather" | "deadline" | "dayBefore" | "start_meet" | "end" | "reapply" | "rematch" | "done";

export interface TourState {
  hasRound: boolean;
  roundStatus: string | null;
  paid: number;
  firstStart: string | null;
  lastEnd: string | null;
  hasNext: boolean;
  nextApps: number;
  nextStatus: string | null;
  t: Date;
}

const DAY_BEFORE_MS = 23 * 3600_000;

/** 지금 해야 할 단계 */
export function tourStep(s: TourState): TourStepKey {
  if (!s.hasRound) return "start";
  if (s.roundStatus === "open" && s.paid < TOUR_MIN_PAID) return "gather";
  if (s.roundStatus === "open" || s.roundStatus === "matching") return "deadline";
  const t = s.t.getTime();
  if (s.firstStart && t < Date.parse(s.firstStart) - DAY_BEFORE_MS) return "dayBefore";
  if (s.firstStart && t < Date.parse(s.firstStart)) return "start_meet";
  if (s.lastEnd && t < Date.parse(s.lastEnd)) return "end";
  if (!s.hasNext || s.nextApps === 0) return "reapply";
  if (s.nextStatus === "open" || s.nextStatus === "matching") return "rematch";
  return "done";
}

export const TOUR_ORDER: TourStepKey[] = ["start", "gather", "deadline", "dayBefore", "start_meet", "end", "reapply", "rematch", "done"];

/** 단계마다 화면에 보일 말. who: 그 단계에서 실제 서비스라면 누가 하는 일인지 */
export const TOUR_TEXT: Record<Exclude<TourStepKey, "done">, { title: string; who: string; does: string; button: string; after: string }> = {
  start: {
    title: "시연용 회차 만들기",
    who: "운영자",
    does: "앞으로 며칠 뒤 저녁 모임 2개 날짜 × 서울 4개 동네(홍대·잠실·강남·을지로) 일정을 가진 회차를 새로 만들어요. 다른 데이터는 지우지 않아요.",
    button: "시연 회차 만들기",
    after: "모집 중인 회차가 생겼어요. 참가자 앱 '일정' 탭에 바로 보여요.",
  },
  gather: {
    title: "참가자 모으기",
    who: "참가자",
    does: "나이·성별·관심사·성향이 제각각인 참가자 36명이 날짜·동네를 고르고 결제까지 마친 상태로 신청해요. 일부는 일부러 한 동네에 몰거나 나이 차를 크게 넣어서, 재배치되거나 테이블에 못 드는 사람이 생길 수 있어요.",
    button: "참가자 36명 신청시키기",
    after: "신청자 화면에서 결제 완료 상태를 볼 수 있어요. 원하면 참가자 앱에서 직접 신청해 봐도 돼요.",
  },
  deadline: {
    title: "신청 마감 → 자동 매칭",
    who: "자동",
    does: "시계를 신청 마감 직후로 옮겨요. 결제한 사람만 대상으로 4~6명 테이블이 자동으로 꾸려지고(나이 차 8살 이내, 성비·관심사·성향), 운영자 승인 없이 확정돼요. 식당 배정과 단체방 첫 공지도 바로 나가요.",
    button: "마감 시각으로 넘기기",
    after: "테이블마다 묶인 이유, 재배치된 사람, 테이블에 못 든 사람과 그 이유를 볼 수 있어요.",
  },
  dayBefore: {
    title: "모임 하루 전",
    who: "자동",
    does: "시계를 첫 모임 하루 전으로 옮겨요. 참가자에게 리마인드 알림이 가고, 단체방에도 같은 안내가 올라와요.",
    button: "모임 하루 전으로 넘기기",
    after: "자동 메시지 발송 이력과 참가자 단체방에서 리마인드를 볼 수 있어요.",
  },
  start_meet: {
    title: "모임 시작",
    who: "자동 + 참가자",
    does: "시계를 첫 모임 시작 직후로 옮겨요. 단체방에 테이블 사람들의 공통 관심사로 고른 대화 주제가 올라오고, 참가자 홈에 체크인 버튼이 생겨요.",
    button: "모임 시작으로 넘기기",
    after: "참가자 단체방의 대화 주제와 홈의 체크인 버튼을 볼 수 있어요.",
  },
  end: {
    title: "모임 끝 → 체크인·후기",
    who: "참가자",
    does: "테스트 참가자들이 체크인하고 후기(만족도·다시 만나고 싶어요/다시는 싫어요)를 남긴 뒤, 시계를 모임 끝으로 옮겨요. 체크인 안 한 사람은 노쇼 후보로 운영자 예외함에 올라가요(예외함에는 다른 회차 건도 함께 보여요).",
    button: "모임 끝내고 후기 남기기",
    after: "피드백 화면에서 만족도와 사람별 선호를, 참석·노쇼 화면에서 이번 회차 체크인을 볼 수 있어요.",
  },
  reapply: {
    title: "다음 회차에 다시 신청",
    who: "참가자",
    does: "다음 주 회차를 만들고, 이번에 참석한 사람들을 그 회차에 다시 신청시켜요.",
    button: "다음 회차 만들고 다시 신청시키기",
    after: "다음 회차 신청자 화면에서 같은 사람들이 다시 신청한 걸 볼 수 있어요.",
  },
  rematch: {
    title: "다음 회차 자동 매칭 (후기 반영)",
    who: "자동",
    does: "다음 회차 마감으로 넘겨 다시 매칭해요. '다시는 싫어요'를 고른 두 사람은 같은 테이블에 앉지 않고, 이미 같이 앉았던 사람보다 처음 보는 사람을 먼저 묶어요.",
    button: "다음 회차 마감으로 넘기기",
    after: "자동 매칭 모니터에서 '다음 매칭에 반영됨' 표시와 새 테이블 조합을 볼 수 있어요.",
  },
};
