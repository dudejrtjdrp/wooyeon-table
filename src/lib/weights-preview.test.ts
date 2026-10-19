import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./matching/types";
import { contributions, pastTableOf, previewSentence, previewTables, rescore } from "./weights-preview";
import { SEED_PRESETS } from "./weights-presets";

// 시뮬레이션 DB에 실제로 저장된 score_detail 값 (기본 가중치로 매긴 것)
const A = pastTableOf("a", "강남", { parts: { age: 0.75, mbti: 0.5, fresh: 1, gender: 1, wanted: 1, interests: 0.75 }, bonus: 0, guideBonus: 0, penalty: 0, total: 81, gate: 81 })!;
const B = pastTableOf("b", "홍대", { parts: { age: 0.625, mbti: 0.5, fresh: 1, gender: 0.85, wanted: 0.5333333333333333, interests: 0.43333333333333335 }, bonus: 0, guideBonus: 0, penalty: 0, total: 64.2, gate: 67.5 })!;
const C = pastTableOf("c", "잠실", { parts: { age: 0.25, mbti: 0.48, fresh: 0.7, gender: 0.2, wanted: 1, interests: 0.4 }, bonus: 0, guideBonus: 0, penalty: 0, total: 42.9, gate: 60.5 })!;
const base = { weights: DEFAULT_SETTINGS.weights, minScore: 50 };

describe("rescore", () => {
  it("같은 가중치면 엔진이 저장한 총점·확정 판정 점수와 똑같다", () => {
    expect(rescore(A, base.weights)).toEqual({ total: 81, gate: 81 });
    expect(rescore(B, base.weights)).toEqual({ total: 64.2, gate: 67.5 });
    expect(rescore(C, base.weights)).toEqual({ total: 42.9, gate: 60.5 });
  });
  it("가점·감점은 저장된 값 그대로 더하고 뺀다 (감점·재참가자 가점은 확정 판정에 안 들어감)", () => {
    const t = pastTableOf("d", "을지로", { parts: A.parts, bonus: 2, guideBonus: 1.3, penalty: 3 })!;
    expect(rescore(t, base.weights)).toEqual({ total: 81.3, gate: 83 });
  });
  it("가중치가 모두 0이면 0점", () => {
    expect(rescore(A, { age: 0, gender: 0, mbti: 0, interests: 0, wanted: 0, fresh: 0 })).toEqual({ total: 0, gate: 0 });
  });
});

describe("pastTableOf", () => {
  it("항목 점수가 빠졌거나 범위를 벗어나면 미리보기에서 뺀다", () => {
    expect(pastTableOf("x", "", {})).toBeNull();
    expect(pastTableOf("x", "", { parts: { ...A.parts, age: 2 } })).toBeNull();
    expect(pastTableOf("x", "", null)).toBeNull();
  });
});

describe("contributions", () => {
  it("항목별 기여를 더하면 총점 변화와 같다", () => {
    const to = SEED_PRESETS[1].weights;
    const c = contributions(B, base.weights, to);
    const sum = Object.values(c).reduce((a, b) => a + b, 0);
    const diff = rescore(B, to).total - rescore(B, base.weights).total;
    expect(Math.abs(sum - diff)).toBeLessThan(0.1);
  });
});

describe("previewTables", () => {
  it("기준이 같으면 바뀐 게 없다", () => {
    const p = previewTables([A, B, C], base, base);
    expect(p.changed).toBe(false);
    expect(p.top).toBeNull();
    expect(p.rows.every((r) => r.top === null)).toBe(true);
  });
  it("최소 점수를 올리면 못 미치는 테이블 수를 센다 (확정 판정 점수 기준)", () => {
    const p = previewTables([A, B, C], base, { weights: base.weights, minScore: 65 });
    expect(p.belowBefore).toBe(0);
    expect(p.belowAfter).toBe(1); // 잠실 60.5
    expect(p.rows.find((r) => r.id === "c")!.below).toBe(true);
    expect(previewSentence(p)).toBe("이 기준이었다면 지난 회차 3개 테이블 중 1개는 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요");
  });
  it("가장 크게 움직인 항목을 고른다", () => {
    // 연령대 몫을 크게 키우면 나이 차가 큰 잠실 테이블은 연령대 때문에 내려간다
    const p = previewTables([A, B, C], base, { weights: { ...base.weights, age: 80 }, minScore: 50 });
    const c = p.rows.find((r) => r.id === "c")!;
    expect(c.after).toBeLessThan(c.before);
    expect(c.top?.key).toBe("age");
    expect(c.top!.delta).toBeLessThan(0);
    expect(p.top?.key).toBe("age");
  });
  it("한 줄 결론: 모두 넘을 때와 모두 못 미칠 때", () => {
    expect(previewSentence(previewTables([A, B], base, base), "11월 둘째 주")).toBe("이 기준이어도 11월 둘째 주 2개 테이블 모두 최소 점수를 넘어 그대로 확정됐을 거예요");
    expect(previewSentence(previewTables([A, B], base, { weights: base.weights, minScore: 95 }))).toBe("이 기준이었다면 지난 회차 2개 테이블 모두 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요");
    expect(previewSentence(previewTables([], base, base))).toBe("");
    expect(previewSentence(previewTables([A], base, base))).toBe("이 기준이어도 지난 회차 테이블 1개는 최소 점수를 넘어 그대로 확정됐을 거예요");
  });
});
