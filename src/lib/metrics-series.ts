// 운영 지표 화면용 가공. 지표 정의·계산은 metrics.ts의 computeMetrics 그대로 쓰고, 여기서는 회차별로 돌려 모으기만 한다
import { type Metric, type MetricsInput, computeMetrics, fmtMinutes } from "./metrics";

export interface SeriesRound {
  id: string;
  title: string;
  match_at: string;
}

export interface SeriesPoint {
  roundId: string;
  title: string;
  value: number | null;
  numerator: number;
  denominator: number;
}

/** 지표별 회차 값. 회차마다 computeMetrics(input, 회차)를 돌린다. 신청이 하나도 없는 회차(아직 안 열린 회차)는 뺀다 */
export function metricSeries(input: MetricsInput, rounds: SeriesRound[]): Record<string, SeriesPoint[]> {
  const used = new Set(input.apps.map((a) => a.round_id));
  const out: Record<string, SeriesPoint[]> = {};
  for (const r of [...rounds].sort((a, b) => a.match_at.localeCompare(b.match_at))) {
    if (!used.has(r.id)) continue;
    for (const m of computeMetrics(input, r.id)) {
      (out[m.key] ??= []).push({ roundId: r.id, title: r.title, value: m.value, numerator: m.numerator, denominator: m.denominator });
    }
  }
  return out;
}

export interface MetricDelta {
  /** 비교한 두 회차 */
  from: string;
  to: string;
  /** 비율은 %p, 분은 분, 인원은 명 */
  diff: number;
  /** 좋아졌으면 true, 나빠졌으면 false, 같으면 null */
  better: boolean | null;
  text: string;
}

/**
 * 지난 회차와의 차이. 회차를 고르면 그 회차와 바로 앞 회차(값이 있는 것)를, 전체 누적이면 값이 있는 마지막 두 회차를 비교한다.
 * 비교할 값이 둘이 안 되면 null
 */
export function metricDelta(m: { unit: Metric["unit"] | "count"; higherIsBetter: boolean }, series: SeriesPoint[], roundId?: string): MetricDelta | null {
  const end = roundId ? series.findIndex((p) => p.roundId === roundId) : series.length - 1;
  if (end < 0) return null;
  const upto = series.slice(0, end + 1).filter((p) => p.value !== null);
  if (roundId && series[end].value === null) return null;
  if (upto.length < 2) return null;
  const [a, b] = upto.slice(-2);
  const raw = b.value! - a.value!;
  const diff = m.unit === "ratio" ? Math.round(raw * 1000) / 10 : Math.round(raw);
  const better = diff === 0 ? null : diff > 0 === m.higherIsBetter;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const abs = Math.abs(diff);
  const text = m.unit === "ratio" ? `${sign}${abs}%p` : m.unit === "count" ? `${sign}${abs}명` : `${sign}${fmtMinutes(abs)}`;
  return { from: a.title, to: b.title, diff, better, text };
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** 앞 단계에서 넘어온 비율(0~1). 첫 단계·앞 단계 0명이면 null */
  fromPrev: number | null;
  /** 첫 단계 대비(막대 길이) 0~1 */
  share: number;
}

/**
 * 신청 → 결제 → 확정 → 참석 → 후기. 각 단계 인원은 지표 13개의 분자를 그대로 쓴다
 * (제출한 신청·결제 완료·테이블 확정·체크인·후기 제출)
 */
export function funnel(metrics: Metric[]): FunnelStage[] {
  const n = (k: string) => metrics.find((m) => m.key === k)?.numerator ?? 0;
  const steps = [
    { key: "apply", label: "신청", count: n("apply_complete") },
    { key: "pay", label: "결제", count: n("pay_conversion") },
    { key: "confirm", label: "확정", count: n("match_success") },
    { key: "attend", label: "참석", count: n("attend_conversion") },
    { key: "review", label: "후기", count: n("feedback") },
  ];
  const top = steps[0].count;
  return steps.map((s, i) => ({
    ...s,
    fromPrev: i === 0 || steps[i - 1].count === 0 ? null : s.count / steps[i - 1].count,
    share: top > 0 ? Math.min(1, s.count / top) : 0,
  }));
}

/** 아직 열려 있는(운영자 확인 전) 노쇼 후보 예외 수. 회차를 주면 그 회차 것만 */
export function waitingNoShow(input: Pick<MetricsInput, "exceptions">, roundId?: string): number {
  return input.exceptions.filter((e) => e.kind === "no_show" && e.status === "open" && (!roundId || e.round_id === roundId)).length;
}

/** 회차별 확인 기다리는 노쇼 후보 수(metricSeries와 같은 회차 순서) */
export function waitingNoShowSeries(input: Pick<MetricsInput, "exceptions">, series: SeriesPoint[]): SeriesPoint[] {
  return series.map((p) => {
    const n = waitingNoShow(input, p.roundId);
    return { roundId: p.roundId, title: p.title, value: n, numerator: n, denominator: 1 };
  });
}

/** 비율을 막대 길이(0~100)로. 분 단위나 값 없음은 null */
export function meterPct(m: Pick<Metric, "unit" | "value">): number | null {
  if (m.unit !== "ratio" || m.value === null) return null;
  return Math.max(0, Math.min(100, Math.round(m.value * 100)));
}

/** 회차별 값 목록을 한 줄 요약으로(스크린리더·차트 설명용) */
export function seriesSummary(m: Pick<Metric, "unit" | "name">, series: SeriesPoint[]): string {
  const vals = series.map((p) => `${p.title} ${p.value === null ? "데이터 없음" : m.unit === "ratio" ? `${Math.round(p.value * 1000) / 10}%` : fmtMinutes(p.value)}`);
  return vals.length ? `${m.name} 회차별: ${vals.join(", ")}` : `${m.name}: 회차별 데이터가 아직 없어요`;
}
