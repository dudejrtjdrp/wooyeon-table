import { describe, expect, it } from "vitest";
import { fmtDayClock, fmtSlot } from "./format";

describe("마감 시각 표기", () => {
  it("정확히 0시는 화면마다 같은 말로 '전날 밤 12시'라고 쓴다", () => {
    // 2026-11-04(수) 00:00 KST = 모임 주 화요일 24:00
    const cut = "2026-11-03T15:00:00Z";
    expect(fmtSlot(cut)).toBe("11월 3일(화) 밤 12시");
    expect(fmtDayClock(cut)).toEqual(["11월 3일(화)", "밤 12시"]);
  });
  it("그 밖의 시각은 날짜와 시각을 나눠 쓴다", () => {
    expect(fmtDayClock("2026-10-30T10:30:00Z")).toEqual(["10월 30일(금)", "저녁 7:30"]);
  });
});
