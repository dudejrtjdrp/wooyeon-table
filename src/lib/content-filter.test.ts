import { describe, expect, it } from "vitest";
import { contentBack, contentFiltered, contentSearch, filterContents, parseContentFilter, tagOptions } from "./content-filter";

const C = [
  { id: "1", body: "요즘 가장 가고 싶은 여행지는?", tags: ["여행"], table_types: ["first"], active: true },
  { id: "2", body: "최근 맛있게 먹은 집", tags: ["맛집 탐방", "여행"], table_types: [], active: false },
  { id: "3", body: "주말에 뭐 하세요?", tags: [], table_types: ["small"], active: true },
];
const ids = (sp: Record<string, string>) => filterContents(C, parseContentFilter(sp)).map((c) => c.id);
const enc = encodeURIComponent;

describe("대화 콘텐츠 거르기 읽기", () => {
  it("종류는 기본이 대화 주제, 모르는 유형·상태는 버린다", () => {
    expect(parseContentFilter({})).toEqual({ k: "topic", q: undefined, tag: undefined, type: undefined, state: undefined });
    expect(parseContentFilter({ k: "icebreaker", type: "small", state: "off" })).toMatchObject({ k: "icebreaker", type: "small", state: "off" });
    expect(parseContentFilter({ type: "vip", state: "maybe" })).toMatchObject({ type: undefined, state: undefined });
    expect(contentFiltered(parseContentFilter({ k: "icebreaker" }))).toBe(false);
  });
  it("주소 쿼리로 돌리고, 저장 뒤 돌아올 주소는 믿을 수 있는 값만 남긴다", () => {
    expect(contentSearch({ k: "topic", q: "여행", state: "on" })).toBe(`?k=topic&q=${enc("여행")}&state=on`);
    expect(contentBack(`?k=topic&q=${enc("여행")}&evil=1&type=vip`, "icebreaker")).toBe(`?k=icebreaker&q=${enc("여행")}`);
    expect(contentBack(null)).toBe("?k=topic");
  });
});

describe("대화 콘텐츠 검색·거르기", () => {
  it("본문·태그·테이블 유형 이름을 함께 찾는다", () => {
    expect(ids({ q: "맛있게" })).toEqual(["2"]);
    expect(ids({ q: "#여행" })).toEqual(["1", "2"]);
    expect(ids({ q: "4인" })).toEqual(["3"]);
    expect(ids({ q: "첫 참가" })).toEqual(["1"]);
  });
  it("태그·유형·노출 상태로 거르고, 비워 둔 것만 보기도 된다", () => {
    expect(ids({ tag: "맛집 탐방" })).toEqual(["2"]);
    expect(ids({ tag: "none" })).toEqual(["3"]);
    expect(ids({ type: "first" })).toEqual(["1"]);
    expect(ids({ type: "none" })).toEqual(["2"]);
    expect(ids({ state: "off" })).toEqual(["2"]);
    expect(ids({ state: "on", tag: "여행" })).toEqual(["1"]);
  });
  it("태그 목록은 많이 쓰인 순", () => {
    expect(tagOptions(C)).toEqual(["여행", "맛집 탐방"]);
  });
});
