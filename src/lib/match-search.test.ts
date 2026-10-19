import { describe, expect, it } from "vitest";
import { hits, tableHits } from "./match-search";

const t = { names: ["임나연", "윤민서"], reservationName: "우연한식탁 ABC5", venueName: "종로 한옥식탁", region: "을지로·종로·광화문" };

describe("매칭 모니터 검색", () => {
  it("이름 일부로 찾는다", () => expect(tableHits("나연", t)).toBe(true));
  it("예약명은 띄어쓰기·대소문자를 무시한다", () => expect(tableHits("우연한 식탁 abc5", t)).toBe(true));
  it("식당 이름으로 찾는다", () => expect(tableHits("한옥", t)).toBe(true));
  it("안 맞으면 false", () => expect(tableHits("홍길동", t)).toBe(false));
  it("빈 검색어는 아무것도 안 건다", () => {
    expect(tableHits("  ", t)).toBe(false);
    expect(hits(undefined, "임나연")).toBe(false);
  });
});
