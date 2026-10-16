import { describe, expect, it } from "vitest";
import { type Content, DEFAULT_RULES, chooseContents, pickWithTone, tableTypes, talkTone } from "./contents";

const topic = (id: string, tags: string[] = [], types: string[] = [], priority = 0): Content => ({ id, kind: "topic", tags, table_types: types, priority, body: id });
const DB: Content[] = [
  topic("맛집", ["맛집 탐방"]),
  topic("여행", ["여행"]),
  topic("전시", ["전시·미술"]),
  topic("요즘 노래"),
  topic("올해 할 일"),
  { id: "ice", kind: "icebreaker", tags: [], table_types: [], priority: 0, body: "별명 소개" },
];
const person = (mbti: string | null, traits: string[] = []) => ({ birthYear: 1996, pastAttended: 0, mbti, traits });

describe("대화 성향 (G8, CON-02)", () => {
  it("MBTI E/I 비율로 성향을 정하고, MBTI가 없으면 본인 성향으로 센다", () => {
    expect(talkTone([{ mbti: "ENFP", traits: [] }, { mbti: "ESTJ", traits: [] }, { mbti: "ENTP", traits: [] }, { mbti: "ISFJ", traits: [] }]).tone).toBe("lively");
    expect(talkTone([{ mbti: "INFP", traits: [] }, { mbti: "ISTJ", traits: [] }, { mbti: "ENFJ", traits: [] }, { mbti: null, traits: ["차분한", "진지한"] }]).tone).toBe("calm");
    expect(talkTone([{ mbti: "ENFP", traits: [] }, { mbti: "INFP", traits: [] }]).tone).toBe("mixed");
    expect(talkTone([{ mbti: null, traits: [] }]).tone).toBe("mixed");
  });

  it("테이블 유형에 대화 성향이 들어간다", () => {
    const types = tableTypes([person("ENFP"), person("ESFP"), person("ENTJ"), person("ESTP")], 2026);
    expect(types).toContain("lively");
  });

  it("관심사가 같아도 성향이 다르면 다른 대화 주제가 나오고, 성향에 맞춘 주제가 꼭 하나 들어간다", () => {
    const common = ["맛집 탐방", "여행", "전시·미술"];
    const lively = tableTypes([person("ENFP"), person("ESFP"), person("ENTJ"), person("ESTP")], 2026);
    const calm = tableTypes([person("INFP"), person("ISFP"), person("INTJ"), person("ISTP")], 2026);
    const a = chooseContents(DB, common, lively, DEFAULT_RULES, "table-1");
    const b = chooseContents(DB, common, calm, DEFAULT_RULES, "table-1");
    expect(a.topics).toHaveLength(3);
    expect(b.topics).toHaveLength(3);
    expect(a.topics.map((x) => x.id)).not.toEqual(b.topics.map((x) => x.id));
    expect(a.topics.some((x) => (x.table_types ?? []).includes("lively"))).toBe(true);
    expect(b.topics.some((x) => (x.table_types ?? []).includes("calm"))).toBe(true);
    // 공통 관심사 주제도 남는다
    expect(a.topics.some((x) => x.id === "맛집")).toBe(true);
    // 아이스브레이킹도 성향을 따른다
    expect(a.icebreakers[0].table_types).toContain("lively");
    expect(b.icebreakers[0].table_types).toContain("calm");
  });

  it("성향 콘텐츠가 이미 위에 있으면 순서를 그대로 둔다", () => {
    const list = [topic("x", [], ["calm"]), topic("y"), topic("z")];
    expect(pickWithTone(list, 2, ["calm"]).map((c) => c.id)).toEqual(["x", "y"]);
    expect(pickWithTone([topic("y"), topic("z"), topic("x", [], ["calm"])], 2, ["calm"]).map((c) => c.id)).toEqual(["y", "x"]);
  });
});
