import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./matching/types";
import { PRESET_MAX, SEED_PRESETS, matchPreset, parsePresets, presetChange, presetError, presetValue, priorityError, shares, toHundred } from "./weights-presets";

describe("parsePresets", () => {
  it("설정이 없으면 기본 템플릿 네 개, 다 지웠으면(빈 목록) 그대로 빈 목록", () => {
    expect(parsePresets(undefined).map((p) => p.name)).toEqual(["골고루(기본)", "대화가 잘 통하게", "비슷한 또래끼리", "새로운 만남 위주"]);
    expect(parsePresets([])).toEqual([]);
  });
  it("기본 템플릿 '골고루'는 매칭 엔진 기본값과 같다", () => {
    expect(SEED_PRESETS[0].weights).toEqual(DEFAULT_SETTINGS.weights);
    expect(SEED_PRESETS[0].minScore).toBe(DEFAULT_SETTINGS.minScore);
  });
  it("기본 템플릿은 모두 합이 100", () => {
    for (const p of SEED_PRESETS) expect(Object.values(p.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("깨진 줄·같은 id는 건너뛴다", () => {
    const ok = { id: "x", name: "a", desc: "", weights: SEED_PRESETS[0].weights, minScore: 50 };
    expect(parsePresets([ok, { ...ok }, { id: "y", name: "b", weights: { age: 1 }, minScore: 50 }, null, "z"]).map((p) => p.id)).toEqual(["x"]);
    expect(parsePresets({})).toEqual([]);
  });
});

describe("presetError", () => {
  const p = { name: "주말 특집", desc: "", weights: { ...SEED_PRESETS[0].weights } as Record<string, number>, minScore: 50 };
  it("정상 값은 통과", () => expect(presetError(p, SEED_PRESETS)).toBeNull());
  it("이름이 비었거나 겹치면 막는다", () => {
    expect(presetError({ ...p, name: "  " }, [])).toMatch("이름");
    expect(presetError({ ...p, name: "골고루(기본)" }, SEED_PRESETS)).toMatch("같은 이름");
    // 자기 자신을 고칠 때는 이름이 같아도 된다
    expect(presetError({ ...p, name: "골고루(기본)" }, SEED_PRESETS, "base")).toBeNull();
  });
  it("점수 범위·합 0·최소 점수를 막는다", () => {
    expect(presetError({ ...p, weights: { ...p.weights, age: 101 } }, [])).toMatch("0~100");
    expect(presetError({ ...p, weights: { age: 0, gender: 0, mbti: 0, interests: 0, wanted: 0, fresh: 0 } }, [])).toMatch("하나 이상");
    expect(presetError({ ...p, minScore: -1 }, [])).toMatch("최소 점수");
  });
  it("개수 제한", () => {
    const many = Array.from({ length: PRESET_MAX }, (_, i) => ({ ...SEED_PRESETS[0], id: `p${i}`, name: `p${i}` }));
    expect(presetError(p, many)).toMatch(`${PRESET_MAX}개`);
    expect(presetError(p, many, "p0")).toBeNull();
  });
});

describe("matchPreset", () => {
  it("지금 저장된 값과 똑같은 템플릿을 찾고, 없으면 null(직접 조정)", () => {
    expect(matchPreset(SEED_PRESETS, { ...DEFAULT_SETTINGS.weights }, 50)?.name).toBe("골고루(기본)");
    expect(matchPreset(SEED_PRESETS, { ...DEFAULT_SETTINGS.weights }, 55)).toBeNull();
    expect(matchPreset(SEED_PRESETS, { ...DEFAULT_SETTINGS.weights, age: 26 }, 50)).toBeNull();
  });
});

describe("shares", () => {
  it("합이 100이면 그대로", () => expect(shares(DEFAULT_SETTINGS.weights as unknown as Record<string, number>)).toEqual(DEFAULT_SETTINGS.weights));
  it("합이 100이 아니어도 비율대로 나누고 합은 꼭 100", () => {
    const s = shares({ age: 1, gender: 1, mbti: 1, interests: 0, wanted: 0, fresh: 0 });
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(100);
    expect(s).toEqual({ age: 34, gender: 33, mbti: 33, interests: 0, wanted: 0, fresh: 0 });
    expect(toHundred({ age: 50, gender: 50, mbti: 0, interests: 0, wanted: 0, fresh: 0 })).toEqual({ age: 50, gender: 50, mbti: 0, interests: 0, wanted: 0, fresh: 0 });
  });
  it("모두 0이면 0", () => expect(Object.values(shares({})).every((v) => v === 0)).toBe(true));
});

describe("presetChange", () => {
  const a = SEED_PRESETS[1];
  it("추가·삭제·수정을 한 줄로", () => {
    expect(presetChange(null, presetValue(a))).toBe("매칭 템플릿 '대화가 잘 통하게' 추가 (연령대 22 · 성비 20 · MBTI 20 · 관심사 20 · 희망 성향 12 · 새로운 사람 6 · 최소 점수 50)");
    expect(presetChange(presetValue(a), null)).toBe("매칭 템플릿 '대화가 잘 통하게' 삭제");
    const b = { ...a, name: "대화 위주", weights: { ...a.weights, mbti: 30 }, minScore: 55 };
    expect(presetChange(presetValue(a), presetValue(b))).toBe("매칭 템플릿 '대화 위주' 이름 대화가 잘 통하게 → 대화 위주 · MBTI 20 → 30 · 최소 점수 50 → 55");
  });
});

describe("PRD 우선순위 지키기 (M8)", () => {
  it("기본 템플릿은 모두 연령대 ≥ 성비 ≥ MBTI ≥ 관심사 ≥ 희망 성향", () => {
    for (const p of SEED_PRESETS) expect(priorityError(p.weights), p.name).toBeNull();
  });
  it("순서를 어기면 막고 무엇이 문제인지 알려 준다", () => {
    const e = priorityError({ age: 18, gender: 18, mbti: 24, interests: 26, wanted: 10, fresh: 4 });
    expect(e).toContain("성비(18) ≥ MBTI(24)");
    // 새로운 사람 비율은 순위 밖이라 커도 된다
    expect(priorityError({ age: 22, gender: 20, mbti: 14, interests: 14, wanted: 8, fresh: 22 })).toBeNull();
  });
});

describe("모달 입력칸 숫자 검사 (valueError)", () => {
  const base = { age: 25, gender: 22, mbti: 18, interests: 15, wanted: 12, fresh: 8 };
  it("기본값은 통과", async () => {
    const { valueError } = await import("./weights-presets");
    expect(valueError(base, 50)).toBeNull();
  });
  it("빈칸·음수·전부 0은 막고, 오류 문구에 NaN이 나오지 않는다", async () => {
    const { valueError, priorityError, shares } = await import("./weights-presets");
    expect(valueError({ ...base, mbti: NaN }, 50)).toMatch(/0~100/);
    expect(valueError({ ...base, age: -5 }, 50)).toMatch(/0~100/);
    expect(valueError({ age: 0, gender: 0, mbti: 0, interests: 0, wanted: 0, fresh: 0 }, 50)).toMatch(/0보다 크게/);
    expect(priorityError({ ...base, mbti: NaN })).not.toMatch(/NaN/);
    expect(shares({ ...base, age: -5 }).age).toBe(0);
  });
});
