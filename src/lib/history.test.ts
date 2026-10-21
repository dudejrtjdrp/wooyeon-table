import { describe, expect, it } from "vitest";
import { type HistApp, pastRowState, splitHistory } from "./history";

const t = new Date("2026-11-10T12:00:00+09:00");
const app = (o: Partial<HistApp> & { id: string }): HistApp => ({
  application_status: "SUBMITTED", match_status: "CONFIRMED", attendance_status: "SCHEDULED",
  dining_tables: { status: "READY", slots: { starts_at: "2026-11-13T19:30:00+09:00", ends_at: "2026-11-13T22:00:00+09:00", region: "홍대·합정·연남" } },
  ...o,
});

describe("참가 이력 (F8)", () => {
  it("다가오는 테이블·지난 식탁·매칭 중 신청으로 나눈다", () => {
    const r = splitHistory([
      app({ id: "next" }),
      app({ id: "done", attendance_status: "ATTENDED", dining_tables: { status: "DONE", slots: { starts_at: "2026-11-06T19:30:00+09:00", region: "잠실" } } }),
      app({ id: "wait", match_status: "WAITING", attendance_status: null, dining_tables: null }),
      app({ id: "cancel", application_status: "CANCELED", match_status: "WAITING", attendance_status: null, dining_tables: null }),
    ], t);
    expect(r.upcoming.map((a) => a.id)).toEqual(["next"]);
    expect(r.past.map((a) => a.id)).toEqual(["done"]);
    expect(r.pending.map((a) => a.id)).toEqual(["wait"]);
  });
  it("지난 식탁엔 날짜·지역이 있고, 별점 여부로 '별점 남기기/남김'을 보인다", () => {
    expect(pastRowState({ attendance_status: "ATTENDED" }, false)).toEqual({ needReview: true, pill: "별점 남기기" });
    expect(pastRowState({ attendance_status: "ATTENDED" }, true)).toEqual({ needReview: false, pill: "별점 남김" });
    expect(pastRowState({ attendance_status: "NO_SHOW" }, false)).toEqual({ needReview: false, pill: null });
  });
});
