import { describe, expect, it } from "vitest";
import { type Content, DEFAULT_RULES, TABLE_TYPES, chooseContents } from "./contents";
import { DEFAULT_CUSTOM, TYPE_GROUPS, contentMessage, parseContentMessage, customTypes, explainScore, parsePreview, previewBack, previewContents, previewQuery } from "./content-preview";
import { INTERESTS } from "./constants";

const c = (id: string, kind: "topic" | "icebreaker", tags: string[] = [], types: string[] = [], priority = 0): Content => ({ id, kind, tags, table_types: types, priority, body: `${id} 이야기` });
const DB: Content[] = [
  c("맛집", "topic", ["맛집 탐방"]),
  c("여행", "topic", ["여행"], [], 2),
  c("첫만남", "topic", [], ["first"]),
  c("요즘", "topic"),
  c("재방문", "topic", [], ["regular"]),
  c("별명", "icebreaker"),
];

describe("대화 콘텐츠 미리 보기", () => {
  it("고르는 결과는 chooseContents와 똑같다 (G8·G12 결과를 바꾸지 않는다)", () => {
    const common = ["여행", "맛집 탐방"];
    const types = ["first", "small", "age20s", "lively"];
    const p = previewContents(DB, common, types, DEFAULT_RULES, "table-1");
    const real = chooseContents(DB, common, types, DEFAULT_RULES, "table-1");
    expect(p.topics.map((x) => x.c.id)).toEqual(real.topics.map((x) => x.id));
    expect(p.icebreakers.map((x) => x.c.id)).toEqual(real.icebreakers.map((x) => x.id));
    // 유형이 안 맞는 '재방문' 주제는 후보도 아니다
    expect(p.nextTopics.some((x) => x.c.id === "재방문")).toBe(false);
  });

  it("점수 풀이는 관심사 순위·테이블 성격·우선순위를 나눠 보여 준다", () => {
    const r = explainScore(DB[1], ["맛집 탐방", "여행"], ["first"], DEFAULT_RULES);
    expect(r).toEqual([
      { text: "#여행 · 테이블 관심사 2순위", points: DEFAULT_RULES.interestWeight * 0.85 },
      { text: "더 자주 뽑기로 정함", points: 2 },
    ]);
    expect(explainScore(DB[2], [], ["first", "small"], DEFAULT_RULES)).toEqual([{ text: "처음 온 분이 많은 테이블", points: DEFAULT_RULES.typeWeight }]);
    expect(explainScore(DB[3], ["여행"], ["first"], DEFAULT_RULES)).toEqual([]);
  });

  it("분위기 맞춤으로 끼워 넣은 주제를 표시한다", () => {
    // 관심사 주제 셋이 위에 몰려도 차분한 테이블용 주제 하나가 들어간다
    const p = previewContents([...DB, c("커피", "topic", ["커피"])], ["여행", "맛집 탐방", "커피"], ["first", "small", "age20s", "calm"], { ...DEFAULT_RULES, interestWeight: 20 }, "t");
    const fill = p.topics.filter((x) => x.toneFill);
    expect(fill).toHaveLength(1);
    expect(fill[0].builtin).toBe(true);
    expect(fill[0].c.table_types).toContain("calm");
  });

  it("단체방 글은 모임 시작 메시지와 같은 모양이다", () => {
    const msg = contentMessage([{ body: "가" }, { body: "나" }], [{ body: "다" }]);
    expect(msg).toContain("테이블에서 함께 나눠 보세요");
    expect(msg).toContain("1. 가\n2. 나");
    expect(msg).toContain("아이스브레이킹\n· 다");
    expect(parseContentMessage(msg)).toEqual({ topics: ["가", "나"], icebreakers: ["다"] });
    expect(parseContentMessage(contentMessage([{ body: "가" }], []))).toEqual({ topics: ["가"], icebreakers: [] });
    // 예전 모양(주제 앞 한 줄)도 읽는다
    expect(parseContentMessage("모두 모이셨나요? 오늘의 대화 주제예요.\n1. 여행\n2. 영화\n\n아이스브레이킹\n· 게임")).toEqual({ topics: ["여행", "영화"], icebreakers: ["게임"] });
  });

  it("미리 보기 조건을 주소에서 읽고 다시 만든다", () => {
    expect(parsePreview({}, INTERESTS)).toEqual(DEFAULT_CUSTOM);
    expect(parsePreview({ pt: "abc-123" }, INTERESTS)).toEqual({ mode: "table", table: "abc-123" });
    const p = parsePreview({ pv: "custom", pi: ["커피", "없는관심사", "커피", "책"], pe: "regular", ps: "large", pa: "age30s", po: "calm" }, INTERESTS);
    expect(p).toEqual({ mode: "custom", interests: ["커피", "책"], exp: "regular", size: "large", age: "age30s", tone: "calm" });
    expect(parsePreview({ pv: "custom", po: "이상한값" }, INTERESTS)).toMatchObject({ tone: "lively", interests: [] });
    if (p.mode === "custom") expect(customTypes(p)).toEqual(["regular", "large", "age30s", "calm"]);
    expect(parsePreview(Object.fromEntries(new URLSearchParams(previewQuery(p))), INTERESTS)).toMatchObject({ mode: "custom", exp: "regular" });
  });

  it("저장 뒤 돌아갈 미리 보기 쿼리는 믿을 수 있는 값만 남긴다", () => {
    expect(previewBack("", INTERESTS)).toBe("");
    expect(previewBack("k=topic", INTERESTS)).toBe("");
    expect(previewBack("pt=t1", INTERESTS)).toBe("pt=t1");
    expect(previewBack("pt=<script>", INTERESTS)).toContain("pv=custom");
    expect(previewBack("pv=custom&pi=여행&pi=맛집 탐방&po=mixed", INTERESTS)).toBe(previewQuery({ ...DEFAULT_CUSTOM, interests: ["여행", "맛집 탐방"], tone: "mixed" }));
  });

  it("테이블 성격 풀이가 모든 유형을 덮는다", () => {
    expect(TYPE_GROUPS.flatMap((g) => g.items.map((i) => i.key)).sort()).toEqual([...TABLE_TYPES].sort());
  });
});
