import { describe, expect, it } from "vitest";
import { passUsage, roomCell } from "./admin-cells";

describe("이용권 칸", () => {
  it("멤버십은 '횟수 제한 없음 · ~까지'", () => {
    expect(passUsage("m1", { total_count: 0, remaining: 0, expires_at: "2026-11-20T05:00:00Z" })).toBe("횟수 제한 없음 · 11월 20일(금)까지");
    expect(passUsage("m3", { total_count: 0, remaining: 0, expires_at: null })).toBe("횟수 제한 없음");
  });
  it("1회권은 남은 횟수", () => {
    expect(passUsage("single", { total_count: 1, remaining: 0, expires_at: null })).toBe("1회 중 0회 남음");
    expect(passUsage("subscription", { total_count: 3, remaining: 2, expires_at: "2026-11-20T05:00:00Z" })).toBe("3회 중 2회 남음 · 11월 20일(금)까지");
  });
  it("이용권이 없으면 -", () => expect(passUsage("single", null)).toBe("-"));
});

describe("테이블 목록 단체방 칸", () => {
  it("해제된 테이블은 '해제됨'", () => {
    expect(roomCell("DISSOLVED", { id: "r1" })).toEqual({ text: "해제됨", tone: "muted" });
    expect(roomCell("DISSOLVED", [])).toEqual({ text: "해제됨", tone: "muted" });
  });
  it("방이 있으면 생성됨, 없거나 빈 배열이면 없음", () => {
    expect(roomCell("READY", [{ id: "r1" }])).toEqual({ text: "생성됨", tone: "ink" });
    expect(roomCell("READY", [])).toEqual({ text: "없음", tone: "danger" });
    expect(roomCell("CONFIRMED", null)).toEqual({ text: "없음", tone: "danger" });
  });
});
