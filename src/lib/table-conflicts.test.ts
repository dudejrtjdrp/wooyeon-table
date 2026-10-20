import { describe, expect, it } from "vitest";
import { pairKey } from "./matching/types";
import { scoreDisplay, scoreTip, tableConflicts } from "./table-conflicts";

const none = { block: new Set<string>(), report: new Set<string>() };

describe("테이블 충돌 세기", () => {
  it("끝난 테이블에서 그 테이블 후기로 남긴 비선호는 충돌이 아니라 '다음 매칭에 반영'", () => {
    const c = tableConflicts({ id: "t1", status: "DONE" }, ["a", "b", "c"], none, [{ from_user: "a", to_user: "b", table_id: "t1" }]);
    expect(c).toEqual({ block: 0, report: 0, avoid: 0, total: 0, reflected: 1 });
  });
  it("아직 안 끝난 테이블이거나 다른 테이블에서 생긴 비선호는 충돌", () => {
    expect(tableConflicts({ id: "t1", status: "CONFIRMED" }, ["a", "b"], none, [{ from_user: "a", to_user: "b", table_id: "t1" }]).total).toBe(1);
    expect(tableConflicts({ id: "t1", status: "DONE" }, ["a", "b"], none, [{ from_user: "b", to_user: "a", table_id: "t0" }]).avoid).toBe(1);
  });
  it("같은 쌍에 예전 비선호와 이번 후기가 둘 다 있으면 충돌로 센다(두 번 세지 않는다)", () => {
    const c = tableConflicts({ id: "t1", status: "DONE" }, ["a", "b"], none, [{ from_user: "a", to_user: "b", table_id: "t1" }, { from_user: "b", to_user: "a", table_id: "t0" }]);
    expect(c.avoid).toBe(1);
    expect(c.reflected).toBe(0);
  });
  it("차단·신고는 늘 충돌", () => {
    const rel = { block: new Set([pairKey("a", "b")]), report: new Set([pairKey("b", "c")]) };
    const c = tableConflicts({ id: "t1", status: "DONE" }, ["a", "b", "c"], rel, []);
    expect(c).toMatchObject({ block: 1, report: 1, total: 2 });
  });
});

describe("점수 표시", () => {
  it("큰 숫자는 확정 판정 점수, 총점은 풀이에", () => {
    const sc = scoreDisplay(55.4, 72.2);
    expect(sc).toEqual({ main: 72, total: 55, differs: true });
    expect(scoreTip(sc, "풀이.")).toContain("총점은 55점");
  });
  it("판정 점수가 없거나 같으면 그대로", () => {
    expect(scoreDisplay(60, undefined)).toEqual({ main: 60, total: 60, differs: false });
    expect(scoreDisplay(60.2, 59.9).differs).toBe(false);
  });
});
