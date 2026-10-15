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
  it("가까운 동네는 붙어 있는 동네의 같은 날짜 일정뿐이다", () => {
    const more = [
      ...slots,
      { id: "e", region: "잠실·송파", sido: "서울", starts_at: "2026-10-23T10:30:00Z" },
      { id: "f", region: "마곡·목동", sido: "서울", starts_at: "2026-10-23T10:30:00Z" },
      { id: "g", region: "잠실·송파", sido: "서울", starts_at: "2026-10-30T10:30:00Z" },
    ];
    // 성수의 이웃은 신사·잠실·을지로. 같은 서울이어도 강남·마곡은 멀어서 빠진다
    expect(nearSlotsFor(["성수·건대"], ["2026-10-23"], more)).toEqual(["e"]);
    // 경계를 넘는 이웃: 강남 ↔ 판교
    expect(nearSlotsFor(["강남·역삼·선릉"], ["2026-10-23"], more)).toEqual(["c", "e"]);
  });
  it("요약 문구", () => {
    expect(areasLabel(["성수·건대", "홍대·합정·연남", "판교·분당"])).toBe("성수·건대 외 2곳");
  });
});
