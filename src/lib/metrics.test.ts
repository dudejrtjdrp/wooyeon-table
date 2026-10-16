import { describe, expect, it } from "vitest";
import { type MetricApp, type MetricsInput, computeMetrics, fmtMinutes, metricValue } from "./metrics";

const app = (id: string, over: Partial<MetricApp> = {}): MetricApp => ({
  id,
  user_id: `u-${id}`,
  round_id: "r1",
  application_status: "SUBMITTED",
  payment_status: "PAID",
  match_status: "CONFIRMED",
  attendance_status: "SCHEDULED",
  realloc_count: 0,
  resolution: null,
  submitted_at: "2026-10-10T00:00:00Z",
  ...over,
});

const empty: MetricsInput = { apps: [], tables: [], exceptions: [], events: [], feedbackAppIds: [], rounds: [{ id: "r1", match_at: "2026-10-20T15:00:00Z" }, { id: "r2", match_at: "2026-10-27T15:00:00Z" }] };
const get = (input: MetricsInput, key: string, roundId?: string) => computeMetrics(input, roundId).find((m) => m.key === key)!;

describe("PRD 3장 지표 13개", () => {
  it("13개 모두 정의·분자·분모를 갖는다", () => {
    const ms = computeMetrics(empty);
    expect(ms).toHaveLength(13);
    for (const m of ms) {
      expect(m.definition.length).toBeGreaterThan(5);
      expect(m.numeratorLabel && m.denominatorLabel).toBeTruthy();
    }
  });

  it("데이터가 없으면 값은 null (화면에서 '아직 데이터 없음')", () => {
    for (const m of computeMetrics(empty)) {
      expect(m.value).toBeNull();
      expect(metricValue(m)).toBeNull();
    }
  });

  it("신청 완료율·결제 전환율", () => {
    const input = { ...empty, apps: [app("a"), app("b", { payment_status: "PENDING", match_status: "WAITING", attendance_status: null }), app("c", { application_status: "DRAFT", submitted_at: null, payment_status: "PENDING", match_status: "WAITING", attendance_status: null })] };
    expect(get(input, "apply_complete")).toMatchObject({ numerator: 2, denominator: 3 });
    expect(get(input, "pay_conversion")).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("매칭 성공률은 매칭이 끝난 결제 완료자 기준, 확정 뒤 노쇼도 확정으로 센다", () => {
    const input = { ...empty, apps: [app("a"), app("b", { attendance_status: "NO_SHOW" }), app("c", { match_status: "ALTERNATIVE_OFFERED", attendance_status: null }), app("d", { match_status: "WAITING", attendance_status: null })] };
    expect(get(input, "match_success")).toMatchObject({ numerator: 2, denominator: 3 });
  });

  it("자동 확정률: 운영자가 손댄 테이블과 운영자가 나눈 테이블은 빠진다", () => {
    const input: MetricsInput = {
      ...empty,
      tables: [
        { id: "t1", round_id: "r1", confirmed_at: "x" },
        { id: "t2", round_id: "r1", confirmed_at: "x" },
        { id: "t3", round_id: "r1", confirmed_at: "x", origin: "admin_split" },
        { id: "t4", round_id: "r1", confirmed_at: null },
      ],
      events: [{ entity_type: "dining_table", entity_id: "t2", field: "member_in", to_value: "김", actor: "admin:1" }],
    };
    expect(get(input, "auto_confirm")).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it("자동 재배치 성공률: 재배치로 확정 ÷ (재배치 시도 + 매칭 실행에서 실패)", () => {
    const input: MetricsInput = {
      ...empty,
      apps: [app("a", { realloc_count: 1 }), app("b", { realloc_count: 2, match_status: "ALTERNATIVE_OFFERED", attendance_status: null }), app("c", { match_status: "ALTERNATIVE_OFFERED", attendance_status: null }), app("d")],
      events: [{ entity_type: "application", entity_id: "c", field: "match_status", to_value: "ALTERNATIVE_OFFERED", actor: "system", match_run_id: "run1" }],
    };
    expect(get(input, "realloc_success")).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it("대체 일정 전환율", () => {
    const input = { ...empty, apps: [app("a", { match_status: "TRANSFERRED", attendance_status: null, resolution: "transfer" }), app("b", { match_status: "ALTERNATIVE_OFFERED", attendance_status: null }), app("c", { match_status: "NO_MATCH", attendance_status: null, resolution: "refund" })] };
    expect(get(input, "alt_conversion")).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it("자동 환불 완료율: 운영자가 다시 시도해 끝난 환불은 자동이 아니다", () => {
    const input: MetricsInput = {
      ...empty,
      apps: [app("a", { payment_status: "REFUNDED" }), app("b", { payment_status: "REFUNDED" }), app("c", { payment_status: "REFUND_FAILED" }), app("d", { payment_status: "REFUND_AVAILABLE" })],
      events: [{ entity_type: "application", entity_id: "b", field: "payment_status", to_value: "REFUNDED", actor: "admin:1" }],
    };
    expect(get(input, "auto_refund")).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it("실제 참가 전환율·노쇼율·피드백 응답률", () => {
    const input: MetricsInput = {
      ...empty,
      apps: [app("a", { attendance_status: "ATTENDED" }), app("b", { attendance_status: "ATTENDED" }), app("c", { attendance_status: "NO_SHOW" }), app("d", { attendance_status: "SCHEDULED" })],
      feedbackAppIds: ["a"],
    };
    expect(get(input, "attend_conversion")).toMatchObject({ numerator: 2, denominator: 4 });
    expect(get(input, "no_show")).toMatchObject({ numerator: 1, denominator: 3 });
    expect(get(input, "feedback")).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("재방문율: 참가한 고유 사용자 중 그 뒤 회차에 다시 신청한 사람", () => {
    const input: MetricsInput = {
      ...empty,
      apps: [
        app("a", { user_id: "u1", attendance_status: "ATTENDED" }),
        app("b", { user_id: "u2", attendance_status: "ATTENDED" }),
        app("c", { user_id: "u1", round_id: "r2", match_status: "WAITING", attendance_status: null }),
      ],
    };
    expect(get(input, "revisit")).toMatchObject({ numerator: 1, denominator: 2 });
    // 회차별로 봐도 이후 회차 신청은 센다
    expect(get(input, "revisit", "r1")).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("운영자 개입률·운영 시간: 운영자가 처리한 예외만, 걸린 시간 평균", () => {
    const input: MetricsInput = {
      ...empty,
      apps: [app("a"), app("b"), app("c"), app("d")],
      exceptions: [
        { id: "e1", kind: "refund", status: "resolved", created_at: "2026-10-21T00:00:00Z", resolved_at: "2026-10-21T00:30:00Z", resolved_by: "admin1", round_id: "r1" },
        { id: "e2", kind: "safety", status: "resolved", created_at: "2026-10-21T00:00:00Z", resolved_at: "2026-10-21T01:30:00Z", resolved_by: "admin1", round_id: "r1" },
        { id: "e3", kind: "no_show", status: "resolved", created_at: "2026-10-21T00:00:00Z", resolved_at: "2026-10-21T00:10:00Z", resolved_by: null, round_id: "r1" },
        { id: "e4", kind: "payment", status: "open", created_at: "2026-10-21T00:00:00Z", resolved_at: null, resolved_by: null, round_id: "r1" },
      ],
    };
    expect(get(input, "intervention")).toMatchObject({ numerator: 2, denominator: 4, value: 0.5 });
    const t = get(input, "ops_time");
    expect(t).toMatchObject({ numerator: 120, denominator: 2, value: 60 });
    expect(metricValue(t)).toBe("1시간");
  });

  it("회차를 고르면 그 회차 데이터만 센다", () => {
    const input = { ...empty, apps: [app("a"), app("b", { round_id: "r2", application_status: "DRAFT", submitted_at: null })] };
    expect(get(input, "apply_complete", "r1")).toMatchObject({ numerator: 1, denominator: 1 });
    expect(get(input, "apply_complete")).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("시간·비율 표기", () => {
    expect(fmtMinutes(45)).toBe("45분");
    expect(fmtMinutes(130)).toBe("2시간 10분");
    expect(fmtMinutes(60 * 27)).toBe("1일 3시간");
    const input = { ...empty, apps: [app("a"), app("b", { application_status: "DRAFT", submitted_at: null })] };
    expect(metricValue(get(input, "apply_complete"))).toBe("50%");
  });
});
