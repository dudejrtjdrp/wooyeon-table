import { describe, expect, it } from "vitest";
import { areasLabel, expandAreas, nearSlotsFor, slotsFor } from "./regions";

const slots = [
  { id: "a", region: "성수·건대", sido: "서울", starts_at: "2026-10-23T10:30:00Z" },
  { id: "b", region: "강남·역삼·선릉", sido: "서울", starts_at: "2026-10-23T10:30:00Z" },
  { id: "c", region: "판교·분당", sido: "경기", starts_at: "2026-10-23T10:30:00Z" },
  { id: "d", region: "강남·역삼·선릉", sido: "서울", starts_at: "2026-10-30T10:30:00Z" },
];

describe("동네 묶음", () => {
  it("'서울 전체'는 서울의 모든 묶음이다", () => {
    expect(expandAreas(["서울 전체"])).toContain("마곡·목동");
    expect(expandAreas(["서울 전체"])).not.toContain("판교·분당");
  });
  it("고른 묶음·날짜의 일정만 지원 대상이 된다", () => {
    expect(slotsFor(["성수·건대"], ["2026-10-23"], slots)).toEqual(["a"]);
    expect(slotsFor(["서울 전체"], ["2026-10-23", "2026-10-30"], slots).sort()).toEqual(["a", "b", "d"]);
  });
  it("가까운 동네는 같은 시·도, 같은 날짜의 다른 묶음뿐이다", () => {
    expect(nearSlotsFor(["성수·건대"], ["2026-10-23"], slots)).toEqual(["b"]);
  });
  it("요약 문구", () => {
    expect(areasLabel(["성수·건대", "홍대·합정·연남", "판교·분당"])).toBe("성수·건대 외 2곳");
  });
});
