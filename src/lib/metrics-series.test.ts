import { describe, expect, it } from "vitest";
import { type MetricApp, type MetricsInput, computeMetrics } from "./metrics";
import { funnel, meterPct, metricDelta, metricSeries, seriesSummary, waitingNoShow, waitingNoShowSeries } from "./metrics-series";

const app = (id: string, round: string, over: Partial<MetricApp> = {}): MetricApp => ({
  id,
  user_id: `u-${id}`,
  round_id: round,
  application_status: "SUBMITTED",
  payment_status: "PAID",
  match_status: "CONFIRMED",
  attendance_status: "SCHEDULED",
  realloc_count: 0,
  resolution: null,
  submitted_at: "2026-10-10T00:00:00Z",
  ...over,
});

const rounds = [
  { id: "r2", title: "둘째", match_at: "2026-10-27T15:00:00Z" },
  { id: "r1", title: "첫째", match_at: "2026-10-20T15:00:00Z" },
  { id: "r3", title: "셋째(빈 회차)", match_at: "2026-11-03T15:00:00Z" },
];
const input: MetricsInput = {
  apps: [
    app("a", "r1"), app("b", "r1", { match_status: "ALTERNATIVE_OFFERED", attendance_status: null }),
    app("c", "r2"), app("d", "r2"), app("e", "r2", { payment_status: "PENDING", match_status: "WAITING", attendance_status: null }),
  ],
  tables: [], exceptions: [], events: [], feedbackAppIds: [],
  rounds: rounds.map((r) => ({ id: r.id, match_at: r.match_at })),
};

describe("회차별 지표", () => {
  const s = metricSeries(input, rounds);
  it("회차 순서대로, 신청 없는 회차는 빼고 computeMetrics 값을 그대로 쓴다", () => {
    expect(s.match_success.map((p) => p.roundId)).toEqual(["r1", "r2"]);
    const r1 = computeMetrics(input, "r1").find((m) => m.key === "match_success")!;
    expect(s.match_success[0]).toMatchObject({ value: r1.value, numerator: 1, denominator: 2 });
    expect(s.match_success[1]).toMatchObject({ numerator: 2, denominator: 2, value: 1 });
    expect(Object.keys(s)).toHaveLength(13);
  });

  it("분모가 0인 회차는 null로 남는다", () => {
    expect(s.no_show.every((p) => p.value === null)).toBe(true);
  });

  it("지난 회차와 차이: %p, 좋아졌는지는 지표 방향을 따른다", () => {
    const m = { unit: "ratio" as const, higherIsBetter: true };
    expect(metricDelta(m, s.match_success)).toMatchObject({ diff: 50, better: true, text: "+50%p", from: "첫째", to: "둘째" });
    expect(metricDelta({ ...m, higherIsBetter: false }, s.match_success)?.better).toBe(false);
    expect(metricDelta(m, s.match_success, "r1")).toBeNull();
    expect(metricDelta(m, s.no_show)).toBeNull();
  });

  it("분 단위 차이는 읽기 쉬운 말로", () => {
    const pts = [{ roundId: "x", title: "x", value: 30, numerator: 0, denominator: 1 }, { roundId: "y", title: "y", value: 100, numerator: 0, denominator: 1 }];
    expect(metricDelta({ unit: "minutes", higherIsBetter: false }, pts)).toMatchObject({ diff: 70, better: false, text: "+1시간 10분" });
  });
});

describe("깔때기", () => {
  it("단계 인원은 지표 분자, 단계 사이 비율은 앞 단계 대비", () => {
    const f = funnel(computeMetrics(input));
    expect(f.map((x) => x.count)).toEqual([5, 4, 3, 0, 0]);
    expect(f[0].fromPrev).toBeNull();
    expect(f[1].fromPrev).toBeCloseTo(0.8);
    expect(f[4].fromPrev).toBeNull();
    expect(f[2].share).toBeCloseTo(0.6);
  });
  it("아무도 없으면 막대 길이 0", () => {
    expect(funnel(computeMetrics({ ...input, apps: [] })).every((x) => x.share === 0)).toBe(true);
  });
});

describe("확인 기다리는 노쇼 후보", () => {
  const ex = (id: string, round: string | null, status = "open", kind = "no_show") => ({ id, kind, status, created_at: "x", resolved_at: null, resolved_by: null, round_id: round });
  const withEx = { ...input, exceptions: [ex("1", "r1"), ex("2", "r2"), ex("3", "r2"), ex("4", "r2", "resolved"), ex("5", "r2", "open", "payment")] };
  it("열린 노쇼 후보만, 회차별로", () => {
    expect(waitingNoShow(withEx)).toBe(3);
    expect(waitingNoShow(withEx, "r2")).toBe(2);
    const s = metricSeries(withEx, rounds);
    const w = waitingNoShowSeries(withEx, s.no_show);
    expect(w.map((p) => p.value)).toEqual([1, 2]);
    expect(metricDelta({ unit: "count", higherIsBetter: false }, w)).toMatchObject({ text: "+1명", better: false });
  });
});

describe("보조", () => {
  it("meterPct는 비율만, 0~100으로", () => {
    expect(meterPct({ unit: "ratio", value: 0.814 })).toBe(81);
    expect(meterPct({ unit: "ratio", value: null })).toBeNull();
    expect(meterPct({ unit: "minutes", value: 30 })).toBeNull();
  });
  it("요약 문장", () => {
    const s = metricSeries(input, rounds);
    expect(seriesSummary({ unit: "ratio", name: "매칭 성공률" }, s.match_success)).toBe("매칭 성공률 회차별: 첫째 50%, 둘째 100%");
    expect(seriesSummary({ unit: "ratio", name: "노쇼율" }, [])).toContain("아직 없어요");
  });
});
