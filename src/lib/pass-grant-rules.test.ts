import { describe, expect, it } from "vitest";
import { GRANT_VALID_DAYS, type PassRow, parseExtendDays, parseGrantCount, passStamp, planExtend, planGrant } from "./pass-grant-rules";

const at = new Date("2026-10-19T03:00:00Z");
const day = 86_400_000;
const iso = (offsetDays: number) => new Date(at.getTime() + offsetDays * day).toISOString();
const pass = (p: Partial<PassRow> & { id: string }): PassRow => ({ pass_type: "single", remaining: 0, total_count: 1, expires_at: iso(30), ...p });

describe("운영자 이용권 처리: 입력 검사", () => {
  it("횟수는 1~5회, 날은 1~30일 정수만 받는다", () => {
    expect(parseGrantCount("1")).toBe(1);
    expect(parseGrantCount("5")).toBe(5);
    for (const v of ["0", "6", "-1", "1.5", "", "abc", null]) expect(parseGrantCount(v), String(v)).toBeNull();
    expect(parseExtendDays("30")).toBe(30);
    expect(parseExtendDays("31")).toBeNull();
    expect(parseExtendDays("0")).toBeNull();
  });

  it("화면을 연 때의 상태가 바뀌면 도장이 달라진다 (두 번 눌러도 한 번만)", () => {
    const a = [pass({ id: "b" }), pass({ id: "a", remaining: 1 })];
    expect(passStamp(a)).toBe(passStamp([...a].reverse()));
    expect(passStamp(a)).not.toBe(passStamp([pass({ id: "b" }), pass({ id: "a", remaining: 2 })]));
    expect(passStamp([])).toBe("");
  });
});

describe("횟수 더하기: 어디에 더할지", () => {
  it("이용권이 없으면 새 1회권을 만들고 오늘부터 60일 쓸 수 있다", () => {
    const p = planGrant([], new Set(), 2, at);
    expect(p).toEqual({ kind: "new", to: { remaining: 2, total: 2, expiresAt: iso(GRANT_VALID_DAYS) } });
  });

  it("돈으로 산 이용권에는 더하지 않는다 (환불하면 남은 횟수를 지우니 보상이 같이 사라진다)", () => {
    const p = planGrant([pass({ id: "paid", remaining: 0 })], new Set(["paid"]), 1, at);
    expect(p.kind).toBe("new");
  });

  it("예전에 운영자가 준 이용권이 아직 쓸 수 있으면 거기에 더하고, 기한은 60일보다 짧으면 60일로 맞춘다", () => {
    const p = planGrant([pass({ id: "gift", remaining: 1, total_count: 1, expires_at: iso(10) })], new Set(), 2, at);
    expect(p).toEqual({ kind: "add", passId: "gift", from: { remaining: 1, total: 1, expiresAt: iso(10) }, to: { remaining: 3, total: 3, expiresAt: iso(GRANT_VALID_DAYS) } });
    const long = planGrant([pass({ id: "gift", expires_at: iso(90) })], new Set(), 1, at);
    expect(long.kind === "add" && long.to.expiresAt).toBe(iso(90));
  });

  it("기한이 지난 이용권과 멤버십에는 더하지 않는다", () => {
    expect(planGrant([pass({ id: "old", expires_at: iso(-1) })], new Set(), 1, at).kind).toBe("new");
    expect(planGrant([pass({ id: "m", pass_type: "m1", total_count: 0 })], new Set(), 1, at).kind).toBe("new");
  });
});

describe("멤버십 기간 늘리기", () => {
  it("멤버십이 없으면 새로 만들지 않고 안내한다", () => {
    const p = planExtend([pass({ id: "s" })], 7, at);
    expect(p.ok).toBe(false);
  });

  it("쓰는 중인 멤버십은 지금 기한에서 늘린다", () => {
    const p = planExtend([pass({ id: "m", pass_type: "m3", expires_at: iso(5) })], 7, at);
    expect(p).toEqual({ ok: true, passId: "m", from: iso(5), to: iso(12), fromToday: false });
  });

  it("기한이 지난 멤버십은 오늘부터 늘린다", () => {
    const p = planExtend([pass({ id: "m", pass_type: "m1", expires_at: iso(-3) })], 7, at);
    expect(p).toEqual({ ok: true, passId: "m", from: iso(-3), to: iso(7), fromToday: true });
  });

  it("멤버십이 여럿이면 기한이 가장 늦은 것을 늘린다", () => {
    const p = planExtend([pass({ id: "a", pass_type: "m1", expires_at: iso(-30) }), pass({ id: "b", pass_type: "m6", expires_at: iso(40) })], 3, at);
    expect(p.ok && p.passId).toBe("b");
  });
});
