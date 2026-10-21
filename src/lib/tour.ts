// 해커톤 심사 투어: 처음 쓰는 사람이 순서대로 버튼 하나씩만 누르면 한 회차의 처음부터 다음 회차까지 볼 수 있게.
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
    button: "모임 끝내고 별점 남기기",
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

export const TOUR_NAME = "해커톤 심사 투어";
/** 진행 모달이 상태를 다시 물어보는 간격과, '오래 걸린다' 안내를 띄우는 시간 */
export const TOUR_POLL_MS = 3_000;
export const TOUR_SLOW_MS = 60_000;
/** 단계 문구 하나를 보여 주는 시간(마지막 문구에서 멈춘다) */
export const TOUR_PHASE_MS = 4_000;

/** 버튼을 누른 뒤 모달에 차례로 보일 '지금 하는 일'. 서버가 실제로 하는 순서대로 */
export const TOUR_PROGRESS: Record<Exclude<TourStepKey, "done">, string[]> = {
  start: ["회차 만드는 중", "날짜 2개 × 동네 4곳 일정 여는 중", "동네마다 식당 자리 잡는 중"],
  gather: ["테스트 참가자 36명 프로필 만드는 중", "날짜·동네 고르고 결제하는 중", "시연 참가자도 같은 일정에 신청하는 중"],
  deadline: ["시계를 신청 마감 직후로 옮기는 중", "결제한 사람만 모아 자동 매칭 도는 중", "조건이 안 맞는 테이블을 풀고 다시 앉히는 중", "식당 배정하고 단체방 만드는 중", "확정 알림과 첫 공지 보내는 중"],
  dayBefore: ["시계를 모임 하루 전으로 옮기는 중", "리마인드 알림 보내는 중", "단체방에 안내 올리는 중"],
  start_meet: ["시계를 모임 시작 직후로 옮기는 중", "테이블마다 대화 주제 고르는 중", "체크인 여는 중"],
  end: ["테스트 참가자 체크인하는 중", "후기와 사람별 선호 남기는 중", "시계를 모임 끝으로 옮기는 중", "노쇼 후보 정리하는 중"],
  reapply: ["다음 회차 만드는 중", "참석한 사람들 다시 신청하는 중", "모자란 일정 채우는 중"],
  rematch: ["시계를 다음 회차 마감 직후로 옮기는 중", "지난 후기와 만남을 불러오는 중", "자동 매칭 도는 중", "식당 배정하고 단체방 만드는 중"],
};

/** 지금 보여 줄 단계 문구 번호 */
export const phaseIndex = (elapsedMs: number, n: number, per = TOUR_PHASE_MS) => Math.max(0, Math.min(n - 1, Math.floor(elapsedMs / per)));

/**
 * 진행 모달이 상태 조회 결과로 할 일.
 * changed: 단계가 바뀜(결과를 보여 줄 때) · slow: 오래 안 바뀜(새로고침 안내) · wait: 계속 기다림
 */
export function pollVerdict(from: TourStepKey, seen: string | null | undefined, elapsedMs: number, slowMs = TOUR_SLOW_MS): "changed" | "slow" | "wait" {
  if (seen && seen !== from) return "changed";
  return elapsedMs >= slowMs ? "slow" : "wait";
}

/** 투어에 쓰는 시연 사람 계정: /guide와 같은 기준(아이디 순 첫 번째, 테스트 참가자 제외) */
export function pickTourHuman<T extends { login_id: string; is_demo?: boolean | null; role?: string | null }>(users: T[]): T | undefined {
  return users
    .filter((u) => u.is_demo !== false && (u.role ?? "user") === "user" && !u.login_id.startsWith("test-"))
    .sort((a, b) => (a.login_id < b.login_id ? -1 : a.login_id > b.login_id ? 1 : 0))[0];
}

/** 시연 사람이 고를 일정: 테스트 참가자가 가장 많이 고른 일정 k개(같으면 먼저 나온 것). 그래야 테이블에 들 가능성이 높다 */
export function busiestSlots(apps: { slots: string[] }[], k = 2): string[] {
  const n = new Map<string, number>();
  for (const a of apps) for (const s of a.slots) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([s]) => s);
}

/** 시연 사람 계정의 이 회차 신청 (휴대폰 화면·투어 링크용) */
export interface HumanApp { id: string; table_id: string | null; match_status: string; payment_status: string; attendance_status: string | null }

/** 휴대폰 화면을 다시 그려야 하는지 비교하는 값: 투어 단계 + 두 회차의 내 신청 상태 */
export function tourSig(step: TourStepKey, cur?: HumanApp | null, next?: HumanApp | null): string {
  const s = (a?: HumanApp | null) => (a ? `${a.payment_status}.${a.match_status}.${a.attendance_status ?? ""}` : "-");
  return `${step}|${s(cur)}|${s(next)}`;
}

/**
 * 휴대폰 따라보기 화면에 보일 한 줄과 앱 링크. 방금 끝난 단계(지금 단계의 바로 앞) 기준.
 * cur: 투어 회차의 내 신청, next: 다음 회차의 내 신청
 */
export function tourPhoneView(step: TourStepKey, cur: HumanApp | null, next: HumanApp | null): { line: string; href: string; label: string } | null {
  const table = cur?.match_status === "CONFIRMED" && cur.table_id ? cur.table_id : null;
  switch (step) {
    case "start":
      return null;
    case "gather":
      return { line: "시연 회차가 열렸어요. 일정 탭에서 날짜와 동네를 볼 수 있어요", href: "/rounds", label: "일정 탭 열기" };
    case "deadline":
      return cur?.payment_status === "PAID"
        ? { line: "신청과 결제가 끝났어요. 마감하면 매칭 결과가 여기로 와요", href: "/", label: "홈에서 신청 상태 보기" }
        : { line: "아직 이 계정은 신청 전이에요. PC에서 참가자 모으기를 누르면 같이 신청돼요", href: "/", label: "홈 열기" };
    case "dayBefore":
      if (table) return { line: "테이블이 확정됐어요. 같이 앉는 이유와 식당을 확인해 보세요", href: `/tables/${table}`, label: "내 테이블 보기" };
      if (cur?.match_status === "ALTERNATIVE_OFFERED") return { line: "이번엔 테이블에 못 들었어요. 다른 일정·환불 중에서 골라 보세요", href: `/applications/${cur.id}/resolve`, label: "다음 방법 고르기" };
      return { line: "매칭 결과를 홈에서 확인해 보세요", href: "/", label: "홈 열기" };
    case "start_meet":
      return table
        ? { line: "하루 전 안내가 왔어요. 단체방과 알림을 확인해 보세요", href: `/tables/${table}/chat`, label: "단체방 열기" }
        : { line: "하루 전 안내는 자리가 확정된 사람에게 가요", href: "/notifications", label: "알림 보기" };
    case "end":
      if (!table) return { line: "모임이 시작됐어요. 확정된 테이블 단체방에 대화 주제가 올라왔어요", href: "/", label: "홈 열기" };
      return cur?.attendance_status === "ATTENDED"
        ? { line: "체크인했어요. 단체방에 대화 주제가 올라와 있어요", href: `/tables/${table}/chat`, label: "대화 주제 보기" }
        : { line: "모임이 시작됐어요. 홈에서 체크인을 눌러 보세요", href: "/", label: "홈에서 체크인하기" };
    case "reapply":
      return table
        ? { line: "모임이 끝났어요. 만족도와 같이 앉은 사람에 대한 선호를 남겨 보세요", href: `/tables/${table}/feedback`, label: "별점 남기기" }
        : { line: "모임이 끝났어요", href: "/", label: "홈 열기" };
    case "rematch":
      return next
        ? { line: "다음 회차에 다시 신청됐어요. 마감하면 지난 후기를 반영해 새로 앉혀요", href: "/", label: "홈에서 신청 상태 보기" }
        : { line: "다음 회차에는 이번 모임에 참석한 사람만 다시 신청돼요", href: "/", label: "홈 열기" };
    case "done": {
      const nt = next?.match_status === "CONFIRMED" && next.table_id ? next.table_id : null;
      if (nt) return { line: "다음 회차 테이블이 확정됐어요. 이번엔 누구와 앉는지 확인해 보세요", href: `/tables/${nt}`, label: "새 테이블 보기" };
      if (next?.match_status === "ALTERNATIVE_OFFERED") return { line: "다음 회차에선 테이블에 못 들었어요. 다음 방법을 골라 보세요", href: `/applications/${next.id}/resolve`, label: "다음 방법 고르기" };
      return { line: "다음 회차 매칭이 끝났어요", href: "/", label: "홈 열기" };
    }
  }
}
