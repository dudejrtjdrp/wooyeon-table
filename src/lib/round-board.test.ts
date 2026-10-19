import { describe, expect, it } from "vitest";
import { DEFAULT_REGIONS } from "./constants";
import { buildBoard, tableRange, parseRoundTab, roundsHref, TABLE_MIN } from "./round-board";

const FRI = "2026-11-06T10:30:00Z"; // 11월 6일(금) 저녁 7:30
const SAT = "2026-11-07T10:30:00Z"; // 11월 7일(토) 저녁 7:30
const SAT_LUNCH = "2026-11-07T03:00:00Z"; // 11월 7일(토) 낮 12시
const [HONGDAE, JAMSIL, GANGNAM] = DEFAULT_REGIONS;

const slot = (id: string, region: string, starts_at: string, max_tables = 4) => ({ id, region, starts_at, max_tables });

describe("일정별 모집 현황 표", () => {
  const slots = [slot("a", JAMSIL, FRI), slot("b", HONGDAE, FRI), slot("c", HONGDAE, SAT), slot("d", GANGNAM, SAT)];
  const counts = new Map([["a", 3], ["b", 9], ["c", 4]]);

  it("줄=동네(운영 동네 순서), 칸=날짜. 날짜는 '11월 6일(금)'처럼 짧게", () => {
    const b = buildBoard(slots, counts, { regionOrder: DEFAULT_REGIONS });
    expect(b.cols.map((c) => c.label)).toEqual(["11월 6일(금)", "11월 7일(토)"]);
    expect(b.rows.map((r) => r.region)).toEqual([HONGDAE, JAMSIL, GANGNAM]);
    expect(b.cols.map((c) => c.label).join()).not.toContain("/");
  });

  it("그 일정이 없는 칸은 null, 신청이 없으면 0명", () => {
    const b = buildBoard(slots, counts, { regionOrder: DEFAULT_REGIONS });
    const jamsil = b.rows.find((r) => r.region === JAMSIL)!;
    expect(jamsil.cells[1]).toBeNull();
    const gangnam = b.rows.find((r) => r.region === GANGNAM)!;
    expect(gangnam.cells[0]).toBeNull();
    expect(gangnam.cells[1]).toMatchObject({ slotId: "d", count: 0 });
  });

  it(`${TABLE_MIN}명이 안 되면 모자람, ${TABLE_MIN}명부터는 아님`, () => {
    const b = buildBoard(slots, counts, { regionOrder: DEFAULT_REGIONS });
    const cell = (region: string, i: number) => b.rows.find((r) => r.region === region)!.cells[i];
    expect(cell(JAMSIL, 0)?.short).toBe(true); // 3명
    expect(cell(GANGNAM, 1)?.short).toBe(true); // 0명
    expect(cell(HONGDAE, 1)?.short).toBe(false); // 4명
    expect(cell(HONGDAE, 0)?.short).toBe(false); // 9명
    expect(b.shortCount).toBe(2);
  });

  it("모집이 끝난 회차(watch=false)는 모자람을 표시하지 않는다", () => {
    const b = buildBoard(slots, counts, { watch: false });
    expect(b.shortCount).toBe(0);
    expect(b.rows.flatMap((r) => r.cells).some((c) => c?.short)).toBe(false);
  });

  it("같은 날 다른 시각 일정이 있으면 칸을 나누고 시각을 붙인다", () => {
    const b = buildBoard([slot("a", HONGDAE, SAT), slot("b", HONGDAE, SAT_LUNCH), slot("c", HONGDAE, FRI)], new Map());
    expect(b.cols.map((c) => c.label)).toEqual(["11월 6일(금)", "11월 7일(토) 낮 12시", "11월 7일(토) 저녁 7:30"]);
    expect(b.clock).toBeNull();
  });

  it("표 위 한 줄: 시작 시각과 최대 테이블·자리 수", () => {
    const b = buildBoard(slots, counts);
    expect(b.clock).toBe("저녁 7:30");
    expect(tableRange(b)).toEqual({ tables: "4", seats: "24" });
    expect(tableRange(buildBoard([slot("a", HONGDAE, FRI, 2), slot("b", JAMSIL, FRI, 4)], new Map()))).toEqual({ tables: "2~4", seats: "12~24" });
    expect(tableRange(buildBoard([], new Map()))).toBeNull();
  });
});

describe("회차 화면 탭", () => {
  it("tab= 값을 읽고, 모르는 값은 현황", () => {
    expect(parseRoundTab("edit")).toBe("edit");
    expect(parseRoundTab("stock")).toBe("stock");
    expect(parseRoundTab("new")).toBe("new");
    expect(parseRoundTab(["stock", "edit"])).toBe("stock");
    expect(parseRoundTab("hack")).toBe("status");
    expect(parseRoundTab(undefined)).toBe("status");
  });

  it("주소: 현황은 tab을 붙이지 않고, 해시는 끝에", () => {
    expect(roundsHref({ r: "x" })).toBe("/admin/rounds?r=x");
    expect(roundsHref({ r: "x", tab: "edit" }, "slots")).toBe("/admin/rounds?r=x&tab=edit#slots");
    expect(roundsHref({ tab: "new" })).toBe("/admin/rounds?tab=new");
    expect(roundsHref({})).toBe("/admin/rounds");
  });
});
