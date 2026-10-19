import { describe, expect, it } from "vitest";
import { describePaymentFilter, methodText, parsePaymentFilter, paymentFiltered, paymentQuery, paymentSearch, paymentTotals, periodOr } from "./payment-filter";

const R = "11111111-2222-4333-8444-555555555555";

describe("결제·환불 거르기", () => {
  it("주소 값을 검사해서 받고, 모르는 값은 버린다", () => {
    const f = parsePaymentFilter({ q: " 김하나 ", r: R, s: "REFUNDED", method: "toss", kind: "membership", from: "2026-10-01", to: "2026-10-19", page: "2" });
    expect(f).toEqual({ q: "김하나", r: R, s: "REFUNDED", method: "toss", kind: "membership", from: "2026-10-01", to: "2026-10-19", page: 2 });
    const bad = parsePaymentFilter({ r: "drop", s: "constructor", method: "cash", kind: "x", from: "2026-02-31", to: "어제", page: "-1" });
    expect(bad).toEqual({ q: undefined, r: undefined, s: undefined, method: undefined, kind: undefined, from: undefined, to: undefined, page: 1 });
    expect(paymentFiltered(bad)).toBe(false);
    expect(paymentFiltered({ page: 3 })).toBe(false);
    expect(paymentFiltered({ page: 1, kind: "single" })).toBe(true);
  });

  it("기간이 거꾸로면 바꿔 잡는다", () => {
    const f = parsePaymentFilter({ from: "2026-10-19", to: "2026-10-01" });
    expect([f.from, f.to]).toEqual(["2026-10-01", "2026-10-19"]);
  });

  it("기간은 서울 날짜 하루 전체, 결제 전인 건은 만든 시각으로 본다", () => {
    const q = paymentQuery(parsePaymentFilter({ from: "2026-10-01", to: "2026-10-19" }));
    expect(q.periodOr).toBe(
      "and(paid_at.gte.2026-09-30T15:00:00.000Z,paid_at.lt.2026-10-19T15:00:00.000Z),and(paid_at.is.null,created_at.gte.2026-09-30T15:00:00.000Z,created_at.lt.2026-10-19T15:00:00.000Z)",
    );
    expect(periodOr("A", undefined)).toBe("paid_at.gte.A,and(paid_at.is.null,created_at.gte.A)");
    expect(periodOr(undefined, undefined)).toBeUndefined();
  });

  it("종류·수단을 결제 칸 조건으로 바꾼다", () => {
    expect(paymentQuery({ page: 1, kind: "single" })).toMatchObject({ passTypes: ["single"], providerNeq: "pass", none: false });
    const m = paymentQuery({ page: 1, kind: "membership", method: "toss" });
    expect(m).toMatchObject({ passTypes: ["m1", "m3", "m6"], providerEq: "toss" });
    expect(m.providerNeq).toBeUndefined();
    expect(paymentQuery({ page: 1, kind: "owned" })).toMatchObject({ providerEq: "pass", none: false });
    // 토스로 결제했는데 보유 이용권 사용인 건은 없다
    expect(paymentQuery({ page: 1, kind: "owned", method: "toss" }).none).toBe(true);
    expect(paymentQuery({ page: 3 }, 50)).toMatchObject({ offset: 100, limit: 50 });
  });

  it("쪽 넘기기·CSV 주소가 같은 거르기를 쓴다", () => {
    const f = parsePaymentFilter({ q: "김", s: "PAID", kind: "single", from: "2026-10-01", page: "4" });
    expect(paymentSearch(f)).toBe("?q=%EA%B9%80&s=PAID&kind=single&from=2026-10-01&page=4");
    expect(paymentSearch(f, 1)).toBe("?q=%EA%B9%80&s=PAID&kind=single&from=2026-10-01");
    expect(parsePaymentFilter(Object.fromEntries(new URLSearchParams(paymentSearch(f))))).toEqual(f);
    expect(paymentSearch({ page: 1 })).toBe("");
  });

  it("숫자 카드는 받은 줄만 센다", () => {
    const t = paymentTotals([
      { amount: 9900, status: "PAID", provider: "toss" },
      { amount: 35000, status: "PAID", provider: "mock" },
      { amount: 9900, status: "REFUNDED", provider: "toss" },
      { amount: 9900, status: "REFUND_FAILED", provider: "toss" },
      { amount: 0, status: "PAID", provider: "pass" },
    ]);
    expect(t).toEqual({ count: 5, paidSum: 44900, refundedN: 1, refundedSum: 9900, failedRefund: 1, passUses: 1 });
  });

  it("결제 수단과 내려받기 설명을 사람 말로", () => {
    expect(methodText({ provider: "toss", method: "간편결제" })).toBe("토스 · 간편결제");
    expect(methodText({ provider: "toss", method: null })).toBe("토스 · 카드");
    expect(methodText({ provider: "mock", method: "card" })).toBe("모의 결제");
    expect(describePaymentFilter({ page: 1 })).toBe("조건 없음(전체)");
    expect(describePaymentFilter({ page: 1, r: R, s: "REFUNDED", kind: "owned", method: "toss", to: "2026-10-19" }, "10월 4주")).toBe(
      "회차 10월 4주 · 상태 환불 완료 · 수단 토스페이먼츠 · 종류 보유 이용권 사용 · 기간 처음~2026-10-19",
    );
  });
});
