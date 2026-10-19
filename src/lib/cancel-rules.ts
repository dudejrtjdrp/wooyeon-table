// 신청 취소 판단 (참가자 본인 취소와 운영자 대리 취소가 같은 규칙을 쓴다). DB를 보지 않는 순수 함수만 둔다.
import { isMembership } from "./constants";
import { refundCutoff, roundCutoff } from "./policy";

const KST = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export type CancelRule = { kind: "early" | "late" | "blocked"; message: string };

/** 확정된 모임을 지금 취소하면 어떻게 되는지. 모임 주 화요일 24:00 전까지는 전액 환불, 그 뒤는 환불 없이 취소, 당일은 취소 불가 */
export function cancelRule(startsAt: string, at: Date): CancelRule {
  const start = new Date(startsAt);
  if (at >= start) return { kind: "blocked", message: "모임이 이미 시작됐어요" };
  if (KST(at) === KST(start)) return { kind: "blocked", message: "당일 취소는 할 수 없어요. 늦을 것 같으면 단체방에 알려 주세요" };
  if (at < refundCutoff(startsAt)) return { kind: "early", message: "지금 취소하면 전액 돌려드려요" };
  return { kind: "late", message: "환불 마감(모임 주 화요일 밤 12시)이 지나 환불 없이 취소돼요" };
}

/** 매칭 전 신청 취소 마감: 매칭 시각과 환불 마감(고른 일정 중 가장 이른 모임 기준) 중 이른 쪽 */
export function beforeMatchCutoff(matchAt: string, starts: string[]): Date {
  return new Date(Math.min(new Date(matchAt).getTime(), roundCutoff(starts)?.getTime() ?? Infinity));
}

export type CancelTarget = {
  applicationStatus: string;
  matchStatus: string;
  attendanceStatus: string | null;
  paymentStatus: string;
  /** payments.pass_type (1회권 single, 멤버십 m1·m3·m6, 예전 subscription) */
  passType: string | null;
  /** 결제 금액. 0이면 보유 이용권으로 낸 신청 */
  amount: number | null;
  matchAt: string;
  /** 고른 일정들의 시작 시각 */
  starts: string[];
  /** 확정된 테이블의 모임 시각 */
  tableStartsAt: string | null;
};

export type CancelPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      /** before_match: 매칭 전 취소, early: 확정 후 환불 마감 전, late: 확정 후 환불 마감 뒤(환불 없음) */
      kind: "before_match" | "early" | "late";
      /** 돈이나 이용권을 돌려주는지 */
      refund: boolean;
      /** 취소하면 결제가 어떻게 되는지 운영자가 읽을 한 줄 */
      money: string;
      /** 확인 창에 한 번 더 띄울 경고 (확정 테이블에서 빠짐) */
      warn: string | null;
    };

/** 결제를 돌려줄 때 무엇이 일어나는지 (billing.ts releaseUse와 같은 갈래) */
export function releaseNote(t: Pick<CancelTarget, "paymentStatus" | "passType" | "amount">): string {
  if (t.paymentStatus !== "PAID") return "결제 전이라 돌려드릴 금액은 없어요";
  if (isMembership(t.passType)) return "멤버십이라 차감한 횟수가 없어요. 기간은 그대로예요";
  if (t.amount === 0 || t.passType === "subscription") return "쓴 이용권 1회를 돌려드려요";
  return "결제한 수단으로 전액 돌려드려요";
}

/**
 * 지금 이 신청을 취소하면 어떻게 되는지. 참가자 본인 취소 규칙을 그대로 따른다.
 * - 매칭 대기: 매칭 시각·환불 마감 전이면 취소하고 결제를 돌려준다. 지나면 막는다
 * - 확정·참석 예정: 환불 마감 전이면 돌려주고, 지나면 환불 없이 취소(경고), 당일·시작 뒤는 막는다
 * - 그 밖(이미 취소, 매칭 실패 후 선택 대기, 참석 처리 끝): 막고 이유를 알려 준다
 */
export function planCancel(t: CancelTarget, at: Date): CancelPlan {
  if (t.applicationStatus === "CANCELED") return { ok: false, message: "이미 취소된 신청이에요" };
  if (t.matchStatus === "WAITING") {
    if (beforeMatchCutoff(t.matchAt, t.starts) <= at) return { ok: false, message: "환불 마감이 지나 매칭 전 취소를 할 수 없어요. 매칭 결과가 나온 뒤에 처리해 주세요" };
    return { ok: true, kind: "before_match", refund: t.paymentStatus === "PAID", money: releaseNote(t), warn: null };
  }
  if (t.matchStatus === "CONFIRMED") {
    if (t.attendanceStatus !== "SCHEDULED" || !t.tableStartsAt) return { ok: false, message: "참석 처리가 끝난 신청이라 취소할 수 없어요" };
    const rule = cancelRule(t.tableStartsAt, at);
    if (rule.kind === "blocked") return { ok: false, message: rule.message };
    const seat = "확정된 테이블에서 빠지고, 빈자리는 대기자에게 먼저 제안돼요";
    if (rule.kind === "early") return { ok: true, kind: "early", refund: t.paymentStatus === "PAID", money: releaseNote(t), warn: seat };
    return { ok: true, kind: "late", refund: false, money: "환불 마감(모임 주 화요일 밤 12시)이 지나 환불 없이 취소돼요", warn: seat };
  }
  if (t.matchStatus === "ALTERNATIVE_OFFERED") return { ok: false, message: "매칭 실패 뒤 참가자가 다른 방법을 고르는 중이에요. 환불이 필요하면 결제·환불 화면에서 해 주세요" };
  return { ok: false, message: "지금 상태에서는 취소할 수 없어요" };
}

export type RefundTarget = {
  status: string; provider: string; amount: number; hasApplication: boolean;
  /** 연결된 신청의 상태. 매칭 대기·확정(참석 예정)이면 신청이 살아 있다 */
  application?: { applicationStatus: string; matchStatus: string; attendanceStatus: string | null };
  /** 멤버십이면 그 멤버십으로 낸 다른 신청 중 아직 진행 중인 수 */
  passLive?: number;
};

/** 신청이 아직 살아 있는지: 취소되지 않았고, 매칭을 기다리거나 확정돼 참석 예정인 상태 */
export function applicationLive(a: { applicationStatus: string; matchStatus: string; attendanceStatus: string | null }): boolean {
  if (a.applicationStatus === "CANCELED") return false;
  if (["WAITING", "MATCHING", "REALLOCATING"].includes(a.matchStatus)) return true;
  return a.matchStatus === "CONFIRMED" && (a.attendanceStatus === null || a.attendanceStatus === "SCHEDULED");
}

/** 운영자 수동 환불을 할 수 있는지. 결제 완료 건만, 돈이 오간 결제만 */
export function manualRefundCheck(p: RefundTarget): { ok: true } | { ok: false; message: string } {
  if (p.status !== "PAID") return { ok: false, message: "결제 완료 건만 환불할 수 있어요" };
  if (p.provider === "pass" || p.amount <= 0) return { ok: false, message: "보유 이용권으로 낸 신청이라 돌려드릴 금액이 없어요. 이용권은 신청 취소로 돌려주세요" };
  if (!p.hasApplication) return { ok: false, message: "이 결제에 연결된 신청을 찾지 못했어요" };
  // 돈만 돌려주고 신청은 그대로 두면, 환불받은 사람이 테이블에 남거나 매칭 대기에 묶인다. 신청 취소는 대리 취소로(환불도 함께 된다)
  if (p.application && applicationLive(p.application)) return { ok: false, message: "이 결제의 신청이 아직 진행 중이에요. 신청자 화면에서 대리 취소하면 환불도 함께 돼요" };
  if (p.passLive) return { ok: false, message: `이 멤버십으로 낸 신청 ${p.passLive}건이 아직 진행 중이에요. 먼저 대리 취소하거나 모임이 끝난 뒤 환불해 주세요` };
  return { ok: true };
}

/** 운영자가 적는 사유. 앞뒤 공백을 지우고 4자 이상이어야 한다 */
export const ADMIN_NOTE_MIN = 4;
export function cleanNote(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length >= ADMIN_NOTE_MIN ? s.slice(0, 300) : null;
}
