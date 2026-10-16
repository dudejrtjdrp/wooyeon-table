import { describe, expect, it } from "vitest";
import { refundCutoff, roundCutoff } from "./policy";

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
