import { describe, expect, it } from "vitest";
import { type CancelTarget, cancelRule, cleanNote, manualRefundCheck, planCancel, releaseNote } from "./cancel-rules";

// 2026-10-23(금) 19:30 KST 모임. 환불 마감 = 10-20(화) 24:00 KST = 2026-10-20T15:00Z
const FRI = "2026-10-23T10:30:00Z";
const MATCH_AT = "2026-10-21T00:00:00Z"; // 수요일 아침 9시 발표
const before = new Date("2026-10-19T03:00:00Z"); // 월요일 낮
const afterCut = new Date("2026-10-21T03:00:00Z"); // 수요일 낮 (마감 뒤)
const sameDay = new Date("2026-10-23T01:00:00Z"); // 금요일 오전 10시 KST

const base: CancelTarget = {
  applicationStatus: "SUBMITTED", matchStatus: "WAITING", attendanceStatus: null, paymentStatus: "PAID",
  passType: "single", amount: 9900, matchAt: MATCH_AT, starts: [FRI], tableStartsAt: null,
};
const confirmed: CancelTarget = { ...base, matchStatus: "CONFIRMED", attendanceStatus: "SCHEDULED", tableStartsAt: FRI };

describe("cancelRule (참가자 본인 취소와 같은 규칙)", () => {
  it("마감 전은 전액 환불, 마감 뒤는 환불 없음, 당일은 막음", () => {
    expect(cancelRule(FRI, before).kind).toBe("early");
    expect(cancelRule(FRI, afterCut).kind).toBe("late");
    expect(cancelRule(FRI, sameDay).kind).toBe("blocked");
    expect(cancelRule(FRI, new Date("2026-10-23T11:00:00Z")).kind).toBe("blocked");
  });
  it("마감 시각 정각부터는 환불 없음", () => {
    expect(cancelRule(FRI, new Date("2026-10-20T14:59:59Z")).kind).toBe("early");
    expect(cancelRule(FRI, new Date("2026-10-20T15:00:00Z")).kind).toBe("late");
  });
});

describe("운영자 대리 취소 판단 planCancel", () => {
  it("매칭 대기 + 마감 전: 취소하고 1회권은 전액 환불", () => {
    const p = planCancel(base, before);
    expect(p).toMatchObject({ ok: true, kind: "before_match", refund: true, warn: null });
    if (p.ok) expect(p.money).toContain("전액");
  });
  it("매칭 대기 + 환불 마감 뒤: 참가자처럼 막는다", () => {
    expect(planCancel(base, afterCut)).toMatchObject({ ok: false });
  });
  it("매칭 대기라도 매칭 시각이 마감보다 이르면 매칭 시각 기준으로 막는다", () => {
    const early = { ...base, matchAt: "2026-10-18T00:00:00Z" };
    expect(planCancel(early, before).ok).toBe(false);
  });
  it("결제 전 신청은 취소만 하고 돌려줄 금액이 없다", () => {
    const p = planCancel({ ...base, paymentStatus: "PENDING" }, before);
    expect(p).toMatchObject({ ok: true, refund: false });
    if (p.ok) expect(p.money).toContain("결제 전");
  });
  it("확정 + 마감 전: 환불하고 테이블 인원 경고", () => {
    const p = planCancel(confirmed, before);
    expect(p).toMatchObject({ ok: true, kind: "early", refund: true });
    if (p.ok) expect(p.warn).toContain("빈자리");
  });
  it("확정 + 마감 뒤: 환불 없이 취소, 그렇다고 분명히 적는다", () => {
    const p = planCancel(confirmed, afterCut);
    expect(p).toMatchObject({ ok: true, kind: "late", refund: false });
    if (p.ok) expect(p.money).toContain("환불 없이");
  });
  it("확정 + 당일: 막는다", () => {
    const p = planCancel(confirmed, sameDay);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.message).toContain("당일");
  });
  it("멤버십은 마감 전이어도 돈을 돌려주지 않고 차감 없음으로 처리", () => {
    const p = planCancel({ ...confirmed, passType: "m1", amount: 35000 }, before);
    expect(p.ok && p.money).toContain("멤버십");
  });
  it("이미 취소·참석 처리 끝·매칭 실패 선택 대기는 막는다", () => {
    expect(planCancel({ ...base, applicationStatus: "CANCELED", matchStatus: "NO_MATCH" }, before).ok).toBe(false);
    expect(planCancel({ ...confirmed, attendanceStatus: "ATTENDED" }, before).ok).toBe(false);
    expect(planCancel({ ...base, matchStatus: "ALTERNATIVE_OFFERED" }, before).ok).toBe(false);
  });
});

describe("releaseNote (releaseUse와 같은 갈래)", () => {
  it("보유 이용권으로 낸 신청은 1회를 돌려준다", () => {
    expect(releaseNote({ paymentStatus: "PAID", passType: "single", amount: 0 })).toContain("이용권 1회");
  });
});

describe("수동 환불 manualRefundCheck", () => {
  const p = { status: "PAID", provider: "toss", amount: 9900, hasApplication: true };
  it("결제 완료 건만 된다", () => {
    expect(manualRefundCheck(p).ok).toBe(true);
    expect(manualRefundCheck({ ...p, status: "REFUNDED" }).ok).toBe(false);
    expect(manualRefundCheck({ ...p, status: "PENDING" }).ok).toBe(false);
  });
  it("보유 이용권 사용 건(0원)은 돈 환불 대상이 아니다", () => {
    expect(manualRefundCheck({ ...p, provider: "pass", amount: 0 }).ok).toBe(false);
  });
  it("연결된 신청이 없으면 막는다", () => {
    expect(manualRefundCheck({ ...p, hasApplication: false }).ok).toBe(false);
  });
  it("신청이 아직 진행 중이면 돈만 돌려주지 않는다 (대리 취소로)", () => {
    const app = (matchStatus: string, attendanceStatus: string | null, applicationStatus = "SUBMITTED") => ({ ...p, application: { applicationStatus, matchStatus, attendanceStatus } });
    expect(manualRefundCheck(app("WAITING", null)).ok).toBe(false);
    expect(manualRefundCheck(app("CONFIRMED", "SCHEDULED")).ok).toBe(false);
    // 모임이 끝났거나 이미 취소된 신청은 된다
    expect(manualRefundCheck(app("CONFIRMED", "ATTENDED")).ok).toBe(true);
    expect(manualRefundCheck(app("CONFIRMED", "NO_SHOW")).ok).toBe(true);
    expect(manualRefundCheck(app("NO_MATCH", null, "CANCELED")).ok).toBe(true);
  });
  it("멤버십으로 낸 신청이 진행 중이면 멤버십 환불을 막는다", () => {
    expect(manualRefundCheck({ ...p, passLive: 2 }).ok).toBe(false);
    expect(manualRefundCheck({ ...p, passLive: 0 }).ok).toBe(true);
  });
});

describe("운영자 사유 cleanNote", () => {
  it("4자 미만이나 공백만이면 받지 않는다", () => {
    expect(cleanNote("  ")).toBeNull();
    expect(cleanNote("abc")).toBeNull();
    expect(cleanNote("  고객 요청  ")).toBe("고객 요청");
  });
});
