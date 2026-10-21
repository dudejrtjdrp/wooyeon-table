import { describe, expect, it } from "vitest";
import { acceptsSlot, refundCutoff, roundCutoff } from "./policy";

describe("환불·매칭 마감 (모임 주 화요일 24:00)", () => {
  it("금요일 모임은 그 주 화요일 24:00(수요일 0시)", () => {
    // 2026-10-23(금) 19:30 KST
    expect(refundCutoff("2026-10-23T10:30:00Z").toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
  it("토요일 모임도 같은 주 화요일 24:00", () => {
    expect(refundCutoff("2026-10-24T10:00:00Z").toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
  it("월요일 모임은 그 전 주 화요일 24:00", () => {
    expect(refundCutoff("2026-10-26T10:00:00Z").toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
  it("회차 마감은 가장 이른 모임 기준", () => {
    expect(roundCutoff(["2026-10-30T10:30:00Z", "2026-10-23T10:30:00Z"])?.toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
});

// 2026-11-13(금) 저녁 모임의 환불 마감은 11-10(화) 밤 12시 = 11-11 00:00 KST
describe("acceptsSlot: 환불 마감이 지난 일정은 신청을 받지 않는다", () => {
  const starts = "2026-11-13T19:30:00+09:00";
  it("마감 전이면 받는다", () => {
    expect(acceptsSlot(starts, new Date("2026-11-10T23:59:00+09:00"))).toBe(true);
  });
  it("마감이 지나면 받지 않는다", () => {
    expect(acceptsSlot(starts, new Date("2026-11-11T00:00:00+09:00"))).toBe(false);
    expect(acceptsSlot(starts, new Date("2026-11-12T12:00:00+09:00"))).toBe(false);
  });
});
