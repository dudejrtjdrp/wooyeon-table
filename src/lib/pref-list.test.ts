import { describe, expect, it } from "vitest";
import { prefListIds, prefLists, type PrefRow } from "./pref-list";

const p = (from_user: string, to_user: string, pref: string, table_id: string, created_at: string): PrefRow => ({ from_user, to_user, pref, table_id, created_at });

describe("사람별 선호 목록", () => {
  const rows = [
    p("me", "a", "again", "t1", "2026-10-01T10:00:00Z"),
    p("me", "b", "avoid", "t1", "2026-10-01T10:00:00Z"),
    p("me", "a", "again", "t2", "2026-10-08T10:00:00Z"),
    p("c", "me", "avoid", "t2", "2026-10-08T11:00:00Z"),
    p("a", "me", "again", "t1", "2026-10-01T09:00:00Z"),
    p("x", "y", "again", "t3", "2026-10-09T09:00:00Z"),
    p("me", "z", "weird", "t3", "2026-10-09T09:00:00Z"),
  ];

  it("고른 것과 받은 것을 나누고, 모임마다 한 줄로 최근 것부터 둔다", () => {
    const l = prefLists("me", rows);
    expect(l.gave.map((x) => `${x.userId}:${x.tableId}:${x.pref}`)).toEqual(["a:t2:again", "b:t1:avoid", "a:t1:again"]);
    expect(l.got.map((x) => `${x.userId}:${x.pref}`)).toEqual(["c:avoid", "a:again"]);
  });

  it("다른 사람끼리의 선택과 모르는 값은 뺀다", () => {
    const l = prefLists("me", rows);
    expect([...l.gave, ...l.got].some((x) => x.userId === "y" || x.userId === "z")).toBe(false);
  });

  it("종류별로 센다", () => {
    expect(prefLists("me", rows).counts).toEqual({ gaveAgain: 2, gaveAvoid: 1, gotAgain: 1, gotAvoid: 1 });
    expect(prefLists("nobody", rows).counts).toEqual({ gaveAgain: 0, gaveAvoid: 0, gotAgain: 0, gotAvoid: 0 });
  });

  it("읽어야 할 사람·테이블 id를 겹치지 않게 모은다", () => {
    const ids = prefListIds(prefLists("me", rows));
    expect(ids.users.sort()).toEqual(["a", "b", "c"]);
    expect(ids.tables.sort()).toEqual(["t1", "t2"]);
  });
});
