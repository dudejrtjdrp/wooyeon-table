// 매칭 기준 템플릿(settings.matching.presets)과 100점 나눠 갖기 계산. DB를 읽지 않는 순수 함수 (weights-presets.test.ts)
// 템플릿 네 개의 이름·값은 PRD에 없는 화면용 기본값이다(시안 B 값). docs/02-matching-rules.md 3장

import type { Weights } from "./matching/types";

/** audit.ts WEIGHT_KEYS와 같은 순서 (이력 화면이 이 파일을 가져가서 서로 가져오지 않게 따로 둔다) */
export const WEIGHT_KEYS = ["age", "gender", "mbti", "interests", "wanted", "fresh"] as const satisfies readonly (keyof Weights)[];
export type WeightKey = (typeof WEIGHT_KEYS)[number];
export const WEIGHT_LABEL: Record<WeightKey, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };
/** 항목마다 한 줄 풀이 (운영자 말) */
export const WEIGHT_DESC: Record<WeightKey, string> = {
  age: "나이가 비슷할수록 점수를 받아요",
  gender: "남녀가 고르게 섞일수록 점수를 받아요",
  mbti: "대화 템포가 잘 맞을수록 점수를 받아요",
  interests: "겹치는 관심사가 많을수록 점수를 받아요",
  wanted: "원한 상대 성향과 맞을수록 점수를 받아요",
  fresh: "처음 만나는 사이일수록 점수를 받아요",
};

export interface Preset {
  id: string;
  name: string;
  desc: string;
  weights: Weights;
  minScore: number;
}

export const PRESET_MAX = 12;
export const PRESET_NAME_MAX = 20;
export const PRESET_DESC_MAX = 60;

/** 처음 쓰는 곳(설정에 matching.presets가 없을 때) 보여 줄 기본 템플릿 */
export const SEED_PRESETS: Preset[] = [
  { id: "base", name: "골고루(기본)", desc: "또래·성비를 먼저 맞추고 나머지를 고르게 봐요.", weights: { age: 25, gender: 22, mbti: 18, interests: 15, wanted: 12, fresh: 8 }, minScore: 50 },
  { id: "talk", name: "대화가 잘 통하게", desc: "관심사와 대화 성향이 맞는 사람끼리 묶어요.", weights: { age: 18, gender: 18, mbti: 24, interests: 26, wanted: 10, fresh: 4 }, minScore: 50 },
  { id: "peer", name: "비슷한 또래끼리", desc: "나이 차를 최대한 줄여요.", weights: { age: 38, gender: 22, mbti: 12, interests: 12, wanted: 10, fresh: 6 }, minScore: 50 },
  { id: "fresh", name: "새로운 만남 위주", desc: "전에 같이 앉은 적 없는 사람끼리 묶어요.", weights: { age: 22, gender: 20, mbti: 14, interests: 14, wanted: 8, fresh: 22 }, minScore: 50 },
];

const isScore = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 100;

/** 설정 값을 템플릿 목록으로. 키가 아예 없으면 기본 템플릿, 빈 목록이면 빈 목록(다 지운 것). 깨진 줄은 건너뛴다 */
export function parsePresets(v: unknown): Preset[] {
  if (v === undefined || v === null) return SEED_PRESETS.map((p) => ({ ...p, weights: { ...p.weights } }));
  if (!Array.isArray(v)) return [];
  const out: Preset[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const w = r.weights as Record<string, unknown> | undefined;
    if (typeof r.id !== "string" || !r.id || typeof r.name !== "string" || !r.name.trim() || !w || typeof w !== "object") continue;
    if (!WEIGHT_KEYS.every((k) => isScore(w[k])) || !isScore(r.minScore)) continue;
    if (out.some((p) => p.id === r.id)) continue;
    out.push({
      id: r.id,
      name: r.name.trim().slice(0, PRESET_NAME_MAX),
      desc: typeof r.desc === "string" ? r.desc.trim().slice(0, PRESET_DESC_MAX) : "",
      weights: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, w[k] as number])) as unknown as Weights,
      minScore: r.minScore,
    });
  }
  return out;
}

/** 저장할 때 받는 값 검사. 문제가 없으면 null */
export function presetError(p: { name: string; desc: string; weights: Record<string, number>; minScore: number }, others: Preset[], selfId?: string): string | null {
  const name = p.name.trim();
  if (!name) return "템플릿 이름을 적어 주세요";
  if (name.length > PRESET_NAME_MAX) return `이름은 ${PRESET_NAME_MAX}자까지 적을 수 있어요`;
  if (p.desc.trim().length > PRESET_DESC_MAX) return `설명은 ${PRESET_DESC_MAX}자까지 적을 수 있어요`;
  if (!WEIGHT_KEYS.every((k) => isScore(p.weights[k]))) return "항목 점수는 0~100 사이 정수로 적어 주세요";
  if (weightSum(p.weights) <= 0) return "항목 점수를 하나 이상 0보다 크게 적어 주세요";
  if (!isScore(p.minScore)) return "최소 점수는 0~100 사이 정수로 적어 주세요";
  if (others.some((o) => o.id !== selfId && o.name === name)) return "같은 이름의 템플릿이 이미 있어요";
  if (!selfId && others.length >= PRESET_MAX) return `템플릿은 ${PRESET_MAX}개까지 만들 수 있어요. 안 쓰는 것을 지우고 다시 해 주세요`;
  return null;
}

export const weightSum = (w: Record<string, number>) => WEIGHT_KEYS.reduce((n, k) => n + (Number(w[k]) || 0), 0);

/** 값이 같은지 (가중치 6개 + 최소 점수) */
export const sameCriteria = (a: Record<string, number>, aMin: number, b: Record<string, number>, bMin: number) =>
  aMin === bMin && WEIGHT_KEYS.every((k) => (Number(a[k]) || 0) === (Number(b[k]) || 0));

/** 지금 값과 똑같은 템플릿 (없으면 null → '직접 조정') */
export function matchPreset(presets: Preset[], w: Record<string, number>, min: number): Preset | null {
  return presets.find((p) => sameCriteria(p.weights as unknown as Record<string, number>, p.minScore, w, min)) ?? null;
}

/**
 * 100점 중 항목마다 가져가는 최대 점수. 점수는 가중 평균이라 합이 100이 아니어도 비율로 나눈다.
 * 반올림해도 합이 꼭 100이 되게 나머지가 큰 항목부터 1점씩 준다
 */
export function shares(w: Record<string, number>): Record<WeightKey, number> {
  const sum = weightSum(w);
  const out = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, 0])) as Record<WeightKey, number>;
  if (sum <= 0) return out;
  const raw = WEIGHT_KEYS.map((k) => ({ k, v: ((Number(w[k]) || 0) / sum) * 100 }));
  for (const r of raw) out[r.k] = Math.floor(r.v);
  let left = 100 - raw.reduce((n, r) => n + Math.floor(r.v), 0);
  for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || WEIGHT_KEYS.indexOf(a.k) - WEIGHT_KEYS.indexOf(b.k))) {
    if (left <= 0) break;
    out[r.k]++;
    left--;
  }
  return out;
}

/** 합이 100이 아닐 때 비율은 그대로 두고 100에 맞춘 값 */
export const toHundred = (w: Record<string, number>): Weights => shares(w) as unknown as Weights;

/** 이력에 남길 한 줄 값: 이름 + 항목 점수 + 최소 점수 */
export function presetValue(p: Preset | null): string | null {
  if (!p) return null;
  return JSON.stringify({ name: p.name, desc: p.desc, ...Object.fromEntries(WEIGHT_KEYS.map((k) => [k, p.weights[k]])), min: p.minScore });
}

/** 이력 화면 한 줄: 템플릿 추가·수정·삭제 */
export function presetChange(from: string | null, to: string | null): string {
  const parse = (v: string | null) => {
    if (!v) return null;
    try {
      const o = JSON.parse(v) as Record<string, unknown>;
      return typeof o.name === "string" ? o : null;
    } catch { return null; }
  };
  const f = parse(from);
  const t = parse(to);
  const label = (k: string) => (k === "min" ? "최소 점수" : k === "desc" ? "설명" : k === "name" ? "이름" : WEIGHT_LABEL[k as WeightKey]);
  if (!f && t) return `매칭 템플릿 '${t.name}' 추가 (${WEIGHT_KEYS.map((k) => `${WEIGHT_LABEL[k]} ${t[k]}`).join(" · ")} · 최소 점수 ${t.min})`;
  if (f && !t) return `매칭 템플릿 '${f.name}' 삭제`;
  if (f && t) {
    const diff = ["name", "desc", ...WEIGHT_KEYS, "min"].filter((k) => f[k] !== t[k]).map((k) => (k === "desc" ? "설명 고침" : `${label(k)} ${f[k]} → ${t[k]}`));
    return diff.length ? `매칭 템플릿 '${t.name}' ${diff.join(" · ")}` : `매칭 템플릿 '${t.name}' 바뀐 것 없음`;
  }
  return "매칭 템플릿 수정";
}
