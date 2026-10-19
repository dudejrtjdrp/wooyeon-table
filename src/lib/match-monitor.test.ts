import { describe, expect, it } from "vitest";
import { failNote, monitorCounts } from "./match-monitor";

describe("매칭 모니터 요약 숫자 (대시보드와 같은 기준)", () => {
  const apps = [...Array(44).fill({ match_status: "CONFIRMED" }), { match_status: "NO_MATCH" }];
  const tables = [{ status: "READY" }, { status: "DISSOLVED" }];
  it("확정은 지금 확정 상태, 해제는 목록의 해제 테이블, 재배치는 지표 분자. 실행 기록과 다르면 차이를 적는다", () => {
    const c = monitorCounts({ summary: { confirmed: 45, reallocated: 2, dissolved: 0 }, apps, tables, reallocOk: 3 });
    expect(c.confirmed.n).toBe(44);
    expect(c.confirmed.diff).toContain("45명");
    expect(c.reallocated.n).toBe(3);
    expect(c.reallocated.diff).toContain("재배치 2명");
    expect(c.dissolved.n).toBe(1);
    expect(c.dissolved.diff).toBe("매칭 중 해제 0번, 그 뒤 운영자 긴급 수정으로 해제 1번이에요.");
  });
  it("같으면 차이 안내가 없다", () => {
    const c = monitorCounts({ summary: { confirmed: 44, reallocated: 3, dissolved: 1 }, apps, tables, reallocOk: 3 });
    expect([c.confirmed.diff, c.reallocated.diff, c.dissolved.diff]).toEqual([undefined, undefined, undefined]);
  });
  it("요약이 비어도 0으로 센다", () => {
    expect(monitorCounts({ summary: {}, apps: [], tables: [], reallocOk: 0 }).confirmed).toEqual({ n: 0, diff: undefined });
  });
});

describe("못 든 사람 사유·시각은 빈칸이 없다", () => {
  const FIN = "2026-10-20T03:00:00Z";
  it("결제 뒤 매칭 전 취소: 상태로 사유, 취소 시각", () => {
    const n = failNote({ match_status: "NO_MATCH", match_reason: null, application_status: "CANCELED", payment_status: "REFUNDED" }, [{ field: "application_status", to_value: "CANCELED", created_at: "2026-10-18T01:26:08Z" }], FIN);
    expect(n).toEqual({ reason: "결제 뒤 매칭 전에 취소 (환불 완료)", label: "취소", at: "2026-10-18T01:26:08Z" });
  });
  it("적어 둔 사유가 있으면 그것을, 실패 안내 시각은 가장 최근", () => {
    const n = failNote({ match_status: "ALTERNATIVE_OFFERED", match_reason: "성비를 맞출 수 없었어요", realloc_count: 2 }, [
      { field: "match_status", to_value: "ALTERNATIVE_OFFERED", created_at: "2026-10-19T00:00:00Z" },
      { field: "match_status", to_value: "ALTERNATIVE_OFFERED", created_at: "2026-10-19T05:00:00Z" },
    ]);
    expect(n).toEqual({ reason: "성비를 맞출 수 없었어요", label: "실패 안내", at: "2026-10-19T05:00:00Z" });
  });
  it("사유도 기록도 없으면 상태로 사유를, 시각은 매칭 실행 끝난 때", () => {
    expect(failNote({ match_status: "ALTERNATIVE_OFFERED", match_reason: null, realloc_count: 1 }, [], FIN)).toEqual({ reason: "조건에 맞는 테이블을 꾸리지 못해 다른 일정·보관·환불을 안내했어요 (재배치 1번 시도)", label: "매칭 실행", at: FIN });
    expect(failNote({ match_status: "NO_MATCH", match_reason: null, resolution: "keep_pass" }, [], FIN).reason).toBe("테이블을 꾸리지 못했고, 이용권으로 보관했어요");
    expect(failNote({ match_status: "NO_MATCH", match_reason: null, resolution: "refund", payment_status: "REFUND_FAILED" }, [], FIN).reason).toBe("테이블을 꾸리지 못했고, 환불을 골랐어요 (환불 실패)");
    expect(failNote({ match_status: "TRANSFERRED", match_reason: null }, [], FIN).reason).toBe("다른 일정으로 옮겼어요");
    expect(failNote({ match_status: "EXCEPTION", match_reason: null }, [], null)).toEqual({ reason: "신청 정보가 빠져 매칭에서 뺐어요. 예외 처리함에서 확인해 주세요", label: "예외", at: null });
  });
});
