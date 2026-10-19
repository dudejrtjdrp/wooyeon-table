// 운영자가 직접 하는 세 가지 처리의 판단 (DB 없이 테스트한다)
//  1. 테이블 식당 바꾸기: 바꿀 수 있는지, 후보 식당
//  2. 참석 관리: 체크인·노쇼·참석 예정으로 되돌리기가 되는지
//  3. 자동 매칭 지금 돌리기: 돌릴 수 있는지, 확인 문구
import { fmtDateTime } from "./format";

type No = { ok: false; reason: string };

// ─────────────────────────────────────────────
// 1. 식당 바꾸기
// ─────────────────────────────────────────────

/** 식당을 바꿀 수 있는 테이블 상태 (확정~안내 완료). 모임이 시작되면(IN_PROGRESS) 막는다 */
export const VENUE_SWAP_STATUS = ["CONFIRMED", "VENUE_ASSIGNED", "READY"];

export function canSwapVenue(o: { status: string; hasVenue: boolean; startsAt: string; now: Date }): { ok: true } | No {
  if (!VENUE_SWAP_STATUS.includes(o.status)) return { ok: false, reason: o.status === "IN_PROGRESS" ? "모임이 이미 시작돼 식당을 바꿀 수 없어요" : "끝났거나 해제된 테이블이라 식당을 바꿀 수 없어요" };
  if (o.now >= new Date(o.startsAt)) return { ok: false, reason: "모임이 이미 시작돼 식당을 바꿀 수 없어요" };
  if (!o.hasVenue) return { ok: false, reason: "아직 배정된 식당이 없어요. 예외 처리함에서 먼저 배정해 주세요" };
  return { ok: true };
}

export type SwapOption = {
  venueId: string;
  name: string;
  region: string;
  active: boolean;
  rating: number | null;
  channel: string | null;
  seats: number;
  /** 이 일정에 받을 수 있는 테이블 수 (venue_slots.tables_available) */
  tablesAvailable: number;
};
export type SwapCandidate = SwapOption & { left: number; failedBefore: boolean };

/**
 * 바꿀 수 있는 식당: 같은 동네·같은 일정 재고가 있고, 배정을 켜 둔 식당 중 지금 식당이 아니고,
 * 이미 쓴 테이블을 빼고도 자리가 남고, 테이블 인원이 앉을 수 있는 곳. 평점 높은 순(같으면 남은 자리 많은 순, 이름 순).
 * 예약이 안 돼 이 테이블에서 뺐던 식당도 운영자가 직접 연락했을 수 있어 후보에 두고 표시만 한다.
 */
export function swapCandidates(options: SwapOption[], need: { region: string; party: number; used: Map<string, number>; currentVenueId: string | null; failed?: Set<string> }): SwapCandidate[] {
  return options
    .filter((o) => o.active && o.region === need.region && o.venueId !== need.currentVenueId)
    .map((o) => ({ ...o, left: o.tablesAvailable - (need.used.get(o.venueId) ?? 0), failedBefore: need.failed?.has(o.venueId) ?? false }))
    .filter((o) => o.left > 0 && (o.seats || 6) >= need.party)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.left - a.left || a.name.localeCompare(b.name) || a.venueId.localeCompare(b.venueId));
}

// ─────────────────────────────────────────────
// 2. 참석 관리
// ─────────────────────────────────────────────

export type AttendOp = "checkin" | "noshow" | "revert";
export const ATTEND_OP_LABEL: Record<AttendOp, string> = { checkin: "체크인", noshow: "노쇼", revert: "참석 예정으로 되돌림" };
/** 앱 체크인과 같은 시작 시각: 모임 1시간 전부터 */
export const CHECKIN_OPEN_BEFORE = 60 * 60_000;

/**
 * 운영자가 참석 상태를 바꿀 수 있는지와 바뀔 값.
 * 체크인: 참석 예정인 사람만, 모임 1시간 전부터(끝난 뒤 정정도 됨).
 * 노쇼: 참석 예정인 사람만, 모임이 시작된 뒤에만(제재가 걸린다).
 * 되돌리기: 체크인·노쇼를 참석 예정으로. 후기를 이미 남긴 참석은 되돌리지 않는다(후기가 다음 매칭에 쓰여서).
 */
export function attendanceChange(op: AttendOp, o: { status: string | null; tableStatus: string; startsAt: string; now: Date; hasFeedback?: boolean }): { ok: true; from: string; to: string } | No {
  if (o.tableStatus === "DISSOLVED") return { ok: false, reason: "해제된 테이블이라 참석 상태를 바꿀 수 없어요" };
  const start = new Date(o.startsAt).getTime();
  const s = o.status ?? "";
  if (op === "checkin") {
    if (s === "ATTENDED") return { ok: false, reason: "이미 체크인했어요" };
    if (s !== "SCHEDULED") return { ok: false, reason: s === "NO_SHOW" ? "노쇼로 처리된 분이에요. 먼저 참석 예정으로 되돌려 주세요" : "참석 예정인 분만 체크인할 수 있어요" };
    if (o.now.getTime() < start - CHECKIN_OPEN_BEFORE) return { ok: false, reason: "체크인은 모임 1시간 전부터 할 수 있어요" };
    return { ok: true, from: s, to: "ATTENDED" };
  }
  if (op === "noshow") {
    if (s === "NO_SHOW") return { ok: false, reason: "이미 노쇼로 처리됐어요" };
    if (s !== "SCHEDULED") return { ok: false, reason: s === "ATTENDED" ? "체크인한 분이에요. 잘못 체크인됐다면 먼저 참석 예정으로 되돌려 주세요" : "참석 예정인 분만 노쇼로 처리할 수 있어요" };
    if (o.now.getTime() < start) return { ok: false, reason: "모임이 시작된 뒤에만 노쇼로 처리할 수 있어요" };
    return { ok: true, from: s, to: "NO_SHOW" };
  }
  if (s !== "ATTENDED" && s !== "NO_SHOW") return { ok: false, reason: "체크인이나 노쇼로 처리된 분만 되돌릴 수 있어요" };
  if (s === "ATTENDED" && o.hasFeedback) return { ok: false, reason: "후기를 이미 남긴 참석이라 되돌릴 수 없어요" };
  return { ok: true, from: s, to: "SCHEDULED" };
}

/** 한 사람 줄에서 보여 줄 버튼 (판단은 attendanceChange와 같다) */
export function attendanceOps(o: { status: string | null; tableStatus: string; startsAt: string; now: Date; hasFeedback?: boolean }): AttendOp[] {
  return (["checkin", "noshow", "revert"] as AttendOp[]).filter((op) => attendanceChange(op, o).ok);
}

// ─────────────────────────────────────────────
// 3. 자동 매칭 지금 돌리기
// ─────────────────────────────────────────────

/**
 * 매칭 시각 전이라도 운영자가 지금 돌릴 수 있는지와 확인 문구.
 * 이미 돌았거나(match_runs) 닫힌(취소 포함) 회차는 막는다. 결제를 마친 사람이 없으면 돌릴 게 없어 막는다.
 * 신청 마감 전이면 지금까지 신청·결제한 사람만 들어가고, 돌고 나면 회차가 닫혀 더 신청할 수 없다고 먼저 알린다.
 */
export function canRunMatchNow(o: { status: string; hasRun: boolean; applyDeadline: string; matchAt: string; now: Date; paid: number; unpaid: number }): { ok: true; early: boolean; confirm: string } | No {
  if (o.status === "closed") return { ok: false, reason: "닫힌 회차라 매칭을 돌릴 수 없어요" };
  if (o.hasRun || o.status === "matching" || o.status === "matched") return { ok: false, reason: "이미 매칭이 돌았어요. 같은 회차는 한 번만 돌아요" };
  if (o.status !== "open") return { ok: false, reason: "모집 중인 회차만 돌릴 수 있어요" };
  if (o.paid <= 0) return { ok: false, reason: "결제를 마친 신청자가 없어 아직 돌릴 수 없어요" };
  const early = o.now < new Date(o.applyDeadline);
  const parts = [
    early ? `아직 신청 마감 전이에요(${fmtDateTime(o.applyDeadline)} 마감). 지금 돌리면 마감 전 신청자만 들어가고, 이 회차 신청은 바로 닫혀요.` : "",
    `결제를 마친 ${o.paid}명으로 지금 테이블을 꾸리고 확정·실패 알림을 바로 보내요.`,
    o.unpaid > 0 ? `결제를 마치지 않은 ${o.unpaid}명은 빠져요.` : "",
    `원래 실행 시각(${fmtDateTime(o.matchAt)})을 기다리지 않아요. 돌린 뒤에는 되돌릴 수 없어요. 계속할까요?`,
  ];
  return { ok: true, early, confirm: parts.filter(Boolean).join(" ") };
}

/** 실행 결과 한 줄 */
export function runResultText(o: { alreadyRan: boolean; tables: number; confirmed: number; failed: number; exceptions: number }): string {
  if (o.alreadyRan) return "이미 매칭이 돌았거나 닫힌 회차라 다시 돌리지 않았어요";
  const rest = [o.failed ? `테이블에 못 든 ${o.failed}명에게는 다른 일정·보관·환불을 안내했어요` : "모두 테이블에 앉았어요", o.exceptions ? `정보가 모자란 ${o.exceptions}명은 예외 처리함에 올렸어요` : ""].filter(Boolean);
  return `매칭을 돌렸어요. 테이블 ${o.tables}개, ${o.confirmed}명 확정. ${rest.join(". ")}`;
}
