import { describe, expect, it } from "vitest";
import { adminBackUrl, demoHeaderLine, fillNeeds, isDemoHuman, pickDashboardRound, roundAccepting } from "./demo-panel";
import { passExpiresAt } from "./pass-expiry";

describe("시연 패널 돌아가는 주소", () => {
  it("보던 회차와 패널 펼침을 지킨다", () => {
    const u = adminBackUrl("시각을 옮겼어요", { r: "r-2", demo: true });
    const url = new URL(u, "http://x");
    expect(url.pathname).toBe("/admin");
    expect(url.searchParams.get("r")).toBe("r-2");
    expect(url.searchParams.get("demo")).toBe("1");
    expect(url.searchParams.get("m")).toBe("시각을 옮겼어요");
    expect(url.hash).toBe("#demo");
  });
  it("회차가 없으면 r을 붙이지 않는다", () => {
    expect(adminBackUrl("ok", { demo: true })).not.toContain("r=");
    expect(adminBackUrl("ok")).toBe("/admin?m=ok");
  });
});

describe("대시보드 기본 회차", () => {
  const T = new Date("2026-10-20T12:00:00+09:00");
  const R = (id: string, status: string, at: string) => ({ id, status, match_at: at, apply_deadline: at });
  const old = R("old", "matched", "2026-10-14T00:00:00+09:00");
  const past = R("past", "open", "2026-10-19T00:00:00+09:00");
  const live = R("live", "open", "2026-10-28T00:00:00+09:00");
  const later = R("later", "open", "2026-11-04T00:00:00+09:00");
  const last = R("last", "matched", "2026-11-10T00:00:00+09:00");

  it("주소의 r이 먼저", () => {
    expect(pickDashboardRound([old, live, last], T, "old")?.id).toBe("old");
  });
  it("모집 중인 회차(마감이 가장 가까운 것)를 고른다. 가장 오래된 회차로 가지 않는다", () => {
    expect(pickDashboardRound([old, past, live, later, last], T)?.id).toBe("live");
  });
  it("모집 중이 없으면 매칭 전 회차, 그것도 없으면 가장 최근 회차", () => {
    expect(pickDashboardRound([old, past, last], T)?.id).toBe("past");
    expect(pickDashboardRound([old, last], T)?.id).toBe("last");
  });
  it("없는 r이나 빈 목록", () => {
    expect(pickDashboardRound([old, last], T, "nope")?.id).toBe("last");
    expect(pickDashboardRound([], T)).toBeUndefined();
  });
});

describe("시연 참가자(사람) 구분", () => {
  it("010… 시연 계정은 사람, test-…는 테스트 참가자, 실제 회원은 아님", () => {
    expect(isDemoHuman({ login_id: "01091000000", is_demo: true })).toBe(true);
    expect(isDemoHuman({ login_id: "test-ab-1", is_demo: true })).toBe(false);
    expect(isDemoHuman({ login_id: "01012345678", is_demo: false })).toBe(false);
  });
});

describe("4명이 안 되는 일정 채우기", () => {
  it("한 일정만 고른 사람은 1명, 두 일정을 고른 사람은 반씩 센다", () => {
    const need = fillNeeds([{ slots: ["a"] }, { slots: ["a", "b"] }, { slots: ["a", "b"] }]);
    // a: 1 + 0.5 + 0.5 = 2 → 2명 더, b: 1 → 3명 더
    expect(need.get("a")).toBe(2);
    expect(need.get("b")).toBe(3);
  });
  it("이미 4명이면 채우지 않고, 아무도 안 고른 일정은 건드리지 않는다", () => {
    const need = fillNeeds([{ slots: ["a"] }, { slots: ["a"] }, { slots: ["a"] }, { slots: ["a"] }, { slots: [] }]);
    expect(need.size).toBe(0);
  });
});

describe("이용권 기간은 넘겨준 시각(시연용 시계)부터", () => {
  const from = new Date("2026-11-03T10:00:00+09:00");
  it("1회권 60일, 멤버십 N개월", () => {
    expect(passExpiresAt(0, from).toISOString()).toBe(new Date("2027-01-02T10:00:00+09:00").toISOString());
    expect(passExpiresAt(3, from).getMonth()).toBe((from.getMonth() + 3) % 12);
    expect(from.toISOString()).toBe(new Date("2026-11-03T10:00:00+09:00").toISOString()); // 원본은 그대로
  });
});

describe("패널 머리줄", () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  it("가상 시각이면 그렇게 적는다", () => {
    expect(demoHeaderLine("11월 첫째 주 저녁 (11월 6일(금))", new Date("2026-11-04T00:00:00Z"), 3600, fmt)).toBe("적용 회차: 11월 첫째 주 저녁 (11월 6일(금)) · 시연용 가상 시각 2026-11-04");
    expect(demoHeaderLine("A", new Date("2026-11-04T00:00:00Z"), 0, fmt)).toBe("적용 회차: A · 실제 시각 2026-11-04");
  });
});

describe("신청을 받는 회차 (roundAccepting)", () => {
  const t = new Date("2026-12-02T00:05:00+09:00");
  it("모집 중이고 마감 전이면 받는다", () => expect(roundAccepting({ status: "open", apply_deadline: "2026-12-02T23:59:00+09:00" }, t)).toBe(true));
  it("모집 중이어도 마감이 지났으면 안 받는다", () => expect(roundAccepting({ status: "open", apply_deadline: "2026-12-02T00:00:00+09:00" }, t)).toBe(false));
  it("매칭이 시작된 회차는 안 받는다", () => expect(roundAccepting({ status: "matched", apply_deadline: "2026-12-09T00:00:00+09:00" }, t)).toBe(false));
});
