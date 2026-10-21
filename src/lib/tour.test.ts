import { describe, expect, it } from "vitest";
import { type HumanApp, TOUR_MIN_PAID, TOUR_ORDER, TOUR_PHASE_MS, TOUR_PROGRESS, TOUR_SLOW_MS, type TourState, busiestSlots, phaseIndex, pickTourHuman, pollVerdict, tourPhoneView, tourSig, tourStep } from "./tour";

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

describe("진행 모달 (phaseIndex·pollVerdict)", () => {
  it("단계 문구는 시간에 따라 넘어가고 마지막에서 멈춘다", () => {
    expect(phaseIndex(0, 3)).toBe(0);
    expect(phaseIndex(TOUR_PHASE_MS + 1, 3)).toBe(1);
    expect(phaseIndex(999_999, 3)).toBe(2);
  });
  it("단계가 바뀌면 changed, 오래 안 바뀌면 slow", () => {
    expect(pollVerdict("deadline", "dayBefore", 5_000)).toBe("changed");
    expect(pollVerdict("deadline", "deadline", 5_000)).toBe("wait");
    expect(pollVerdict("deadline", null, TOUR_SLOW_MS)).toBe("slow");
    expect(pollVerdict("deadline", "dayBefore", TOUR_SLOW_MS * 2)).toBe("changed");
  });
  it("모든 단계에 진행 문구가 있다", () => {
    for (const k of TOUR_ORDER) if (k !== "done") expect(TOUR_PROGRESS[k].length).toBeGreaterThan(1);
  });
});

describe("시연 사람 계정 고르기 (pickTourHuman·busiestSlots)", () => {
  it("테스트 참가자·운영자를 빼고 아이디 순 첫 번째", () => {
    const u = [{ login_id: "test-ab-1" }, { login_id: "01091000000" }, { login_id: "admin", role: "admin" }, { login_id: "01000000001" }];
    expect(pickTourHuman(u)?.login_id).toBe("01000000001");
    expect(pickTourHuman([{ login_id: "test-x" }])).toBeUndefined();
  });
  it("가장 많이 고른 일정부터", () => {
    expect(busiestSlots([{ slots: ["a", "b"] }, { slots: ["b"] }, { slots: ["c", "b"] }, { slots: ["c"] }])).toEqual(["b", "c"]);
    expect(busiestSlots([])).toEqual([]);
  });
});

describe("휴대폰 따라보기 (tourPhoneView·tourSig)", () => {
  const app = (o: Partial<HumanApp> = {}): HumanApp => ({ id: "a1", table_id: null, match_status: "WAITING", payment_status: "PAID", attendance_status: null, ...o });
  it("회차 전이면 보일 것이 없다", () => expect(tourPhoneView("start", null, null)).toBeNull());
  it("매칭 뒤 확정이면 내 테이블, 못 들면 다음 방법 고르기", () => {
    expect(tourPhoneView("dayBefore", app({ match_status: "CONFIRMED", table_id: "t1" }), null)?.href).toBe("/tables/t1");
    expect(tourPhoneView("dayBefore", app({ match_status: "ALTERNATIVE_OFFERED" }), null)?.href).toBe("/applications/a1/resolve");
  });
  it("모임 시작 뒤 체크인 전이면 홈 체크인 안내, 했으면 대화 주제", () => {
    const c = app({ match_status: "CONFIRMED", table_id: "t1", attendance_status: "SCHEDULED" });
    expect(tourPhoneView("end", c, null)?.label).toBe("홈에서 체크인하기");
    expect(tourPhoneView("end", { ...c, attendance_status: "ATTENDED" }, null)?.href).toBe("/tables/t1/chat");
  });
  it("모임 끝나면 후기, 다음 회차가 확정되면 새 테이블", () => {
    expect(tourPhoneView("reapply", app({ match_status: "CONFIRMED", table_id: "t1" }), null)?.href).toBe("/tables/t1/feedback");
    expect(tourPhoneView("done", null, app({ match_status: "CONFIRMED", table_id: "t2" }))?.href).toBe("/tables/t2");
  });
  it("단계나 내 상태가 바뀌면 비교값도 바뀐다", () => {
    const a = app();
    expect(tourSig("deadline", a, null)).not.toBe(tourSig("dayBefore", a, null));
    expect(tourSig("deadline", a, null)).not.toBe(tourSig("deadline", { ...a, match_status: "CONFIRMED" }, null));
    expect(tourSig("deadline", null, null)).toBe("deadline|-|-");
  });
});
