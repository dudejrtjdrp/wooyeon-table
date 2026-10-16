import { describe, expect, it } from "vitest";
import { fmtClock, fmtDate, fmtDateTime, fmtDay, fmtDayClock, fmtSlot, fmtTime } from "./format";

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

describe("날짜·시각 표기를 하나로 쓴다", () => {
  const dinner = "2026-11-06T10:30:00Z"; // 11월 6일(금) 19:30 KST
  it("예전 이름(fmtDate·fmtTime·fmtDateTime)도 같은 표기를 낸다", () => {
    expect(fmtDate(dinner)).toBe(fmtDay(dinner));
    expect(fmtDate(dinner)).toBe("11월 6일(금)");
    expect(fmtTime(dinner)).toBe(fmtClock(dinner));
    expect(fmtTime(dinner)).toBe("저녁 7:30");
    expect(fmtDateTime(dinner)).toBe("11월 6일(금) 저녁 7:30");
    expect(`${fmtDate(dinner)} ${fmtTime(dinner)}`).toBe(fmtSlot(dinner));
  });
  it("마감 0시는 fmtDateTime도 전날 밤 12시", () => {
    expect(fmtDateTime("2026-11-03T15:00:00Z")).toBe("11월 3일(화) 밤 12시");
  });
  it("시간대별 말이 정해져 있다", () => {
    expect(fmtClock("2026-11-06T03:00:00Z")).toBe("낮 12시");
    expect(fmtClock("2026-11-06T00:00:00Z")).toBe("오전 9시");
    expect(fmtClock("2026-11-06T07:00:00Z")).toBe("오후 4시");
  });
  it("'오후 7:30'·'(금) ' 같은 예전 표기가 나오지 않는다", () => {
    for (const s of [fmtDate(dinner), fmtTime(dinner), fmtDateTime(dinner)]) {
      expect(s).not.toMatch(/오후 7|일 \(/);
    }
  });
});
