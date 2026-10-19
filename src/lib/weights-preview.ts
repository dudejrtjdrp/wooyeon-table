// 매칭 기준 미리보기: 지난 확정 테이블의 항목별 점수(score_detail.parts)를 새 가중치로 다시 계산한다.
// 매칭 엔진과 같은 식(matching/score.ts weightedScore)을 쓰고, 가점·감점(다시 만나고 싶은 쌍·재참가자·만족도 낮은 조합)은 저장된 값 그대로 둔다.
// 사람을 다시 묶지는 않는다. 실제 조합은 엔진이 새로 짠다 (weights-preview.test.ts)

import { weightedScore } from "./matching/score";
import type { Weights } from "./matching/types";
import { WEIGHT_KEYS, type WeightKey } from "./weights-presets";

export interface PastTable {
  id: string;
  label: string;
  parts: Record<WeightKey, number>;
  bonus: number;
  guideBonus: number;
  penalty: number;
}

/** dining_tables.score_detail에서 미리보기에 필요한 값만. 항목 점수가 하나라도 없으면 null */
export function pastTableOf(id: string, label: string, detail: unknown): PastTable | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const p = d.parts as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const ok = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  if (!WEIGHT_KEYS.every((k) => ok(p[k]))) return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    id,
    label,
    parts: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, p[k] as number])) as Record<WeightKey, number>,
    bonus: num(d.bonus),
    guideBonus: num(d.guideBonus),
    penalty: num(d.penalty),
  };
}

export const rescore = (t: PastTable, w: Weights) => weightedScore(t.parts, w, t);

const shareOf = (w: Weights, k: WeightKey) => {
  const s = WEIGHT_KEYS.reduce((n, x) => n + w[x], 0);
  return s > 0 ? w[k] / s : 0;
};

/**
 * 항목마다 점수 변화에 얼마나 기여했는지. 항목 몫(가중치 비율)이 바뀐 만큼 × (그 항목 맞는 정도 − 테이블 평균).
 * 몫의 변화는 합이 0이라 평균을 빼도 합계(총 변화)는 같고, '잘 맞는 항목의 몫이 커지면 오른다'가 그대로 보인다
 */
export function contributions(t: PastTable, from: Weights, to: Weights): Record<WeightKey, number> {
  const avg = WEIGHT_KEYS.reduce((n, k) => n + t.parts[k], 0) / WEIGHT_KEYS.length;
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, (shareOf(to, k) - shareOf(from, k)) * (t.parts[k] - avg) * 100])) as Record<WeightKey, number>;
}

export interface PreviewRow {
  id: string;
  label: string;
  before: number;
  after: number;
  gateBefore: number;
  gateAfter: number;
  /** 새 기준에서 최소 점수에 못 미치는지 (확정 판정 점수로 본다) */
  below: boolean;
  wasBelow: boolean;
  /** 이 테이블 점수를 가장 크게 움직인 항목 (변화가 거의 없으면 null) */
  top: { key: WeightKey; delta: number } | null;
}

export interface Preview {
  rows: PreviewRow[];
  belowAfter: number;
  belowBefore: number;
  /** 전체 테이블에서 가장 크게 영향을 준 항목과 테이블 평균 기여(점) */
  top: { key: WeightKey; delta: number } | null;
  changed: boolean;
}

const EPS = 0.05;

export function previewTables(tables: PastTable[], from: { weights: Weights; minScore: number }, to: { weights: Weights; minScore: number }): Preview {
  const sum = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, 0])) as Record<WeightKey, number>;
  const rows = tables.map((t) => {
    const b = rescore(t, from.weights);
    const a = rescore(t, to.weights);
    const c = contributions(t, from.weights, to.weights);
    for (const k of WEIGHT_KEYS) sum[k] += c[k];
    const k = topKey(c);
    return {
      id: t.id,
      label: t.label,
      before: b.total,
      after: a.total,
      gateBefore: b.gate,
      gateAfter: a.gate,
      below: a.gate < to.minScore,
      wasBelow: b.gate < from.minScore,
      top: k && Math.abs(c[k]) >= EPS ? { key: k, delta: round1(c[k]) } : null,
    };
  });
  const k = topKey(sum);
  const n = tables.length || 1;
  return {
    rows,
    belowAfter: rows.filter((r) => r.below).length,
    belowBefore: rows.filter((r) => r.wasBelow).length,
    top: k && Math.abs(sum[k] / n) >= EPS ? { key: k, delta: round1(sum[k] / n) } : null,
    changed: rows.some((r) => r.before !== r.after || r.gateBefore !== r.gateAfter || r.below !== r.wasBelow),
  };
}

function topKey(c: Record<WeightKey, number>): WeightKey | null {
  let best: WeightKey | null = null;
  for (const k of WEIGHT_KEYS) if (best === null || Math.abs(c[k]) > Math.abs(c[best])) best = k;
  return best;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** 미리보기 한 줄 결론. 예: "이 기준이었다면 지난 회차 9개 테이블 중 2개는 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요" */
export function previewSentence(p: Preview, roundLabel = "지난 회차"): string {
  const n = p.rows.length;
  if (!n) return "";
  if (n === 1) return p.belowAfter ? `이 기준이었다면 ${roundLabel} 테이블 1개는 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요` : `이 기준이어도 ${roundLabel} 테이블 1개는 최소 점수를 넘어 그대로 확정됐을 거예요`;
  if (p.belowAfter === 0) return `이 기준이어도 ${roundLabel} ${n}개 테이블 모두 최소 점수를 넘어 그대로 확정됐을 거예요`;
  if (p.belowAfter === n) return `이 기준이었다면 ${roundLabel} ${n}개 테이블 모두 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요`;
  return `이 기준이었다면 ${roundLabel} ${n}개 테이블 중 ${p.belowAfter}개는 최소 점수에 못 미쳐 자동 재배치로 넘어갔을 거예요`;
}
