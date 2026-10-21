import { describe, expect, it } from "vitest";
import { TOUR_MIN_PAID, type TourState, tourStep } from "./tour";

const t = new Date("2026-11-01T12:00:00+09:00");
const base: TourState = { hasRound: true, roundStatus: "open", paid: 0, firstStart: "2026-11-04T19:30:00+09:00", lastEnd: "2026-11-05T22:00:00+09:00", hasNext: false, nextApps: 0, nextStatus: null, t };
const at = (iso: string) => new Date(iso);

describe("심사 투어 지금 단계 (tourStep)", () => {
  it("회차가 없으면 만들기부터", () => expect(tourStep({ ...base, hasRound: false })).toBe("start"));
  it("결제 완료가 모자라면 참가자 모으기", () => expect(tourStep(base)).toBe("gather"));
  it("모였으면 마감으로", () => expect(tourStep({ ...base, paid: TOUR_MIN_PAID })).toBe("deadline"));
  it("매칭이 끝나면 시각 순서대로 하루 전 → 시작 → 끝", () => {
    const m = { ...base, roundStatus: "matched", paid: 30 };
    expect(tourStep({ ...m, t: at("2026-11-02T12:00:00+09:00") })).toBe("dayBefore");
    expect(tourStep({ ...m, t: at("2026-11-03T21:00:00+09:00") })).toBe("start_meet");
    expect(tourStep({ ...m, t: at("2026-11-04T19:35:00+09:00") })).toBe("end");
  });
  it("모임이 끝나면 다음 회차 신청 → 다음 매칭 → 끝", () => {
    const e = { ...base, roundStatus: "matched", paid: 30, t: at("2026-11-06T00:00:00+09:00") };
    expect(tourStep(e)).toBe("reapply");
    expect(tourStep({ ...e, hasNext: true, nextApps: 0, nextStatus: "open" })).toBe("reapply");
    expect(tourStep({ ...e, hasNext: true, nextApps: 20, nextStatus: "open" })).toBe("rematch");
    expect(tourStep({ ...e, hasNext: true, nextApps: 20, nextStatus: "matched" })).toBe("done");
  });
});
