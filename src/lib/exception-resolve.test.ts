import { describe, expect, it } from "vitest";
import { bulkNoShowMessage, bulkNoShowTargets, closePlan, noShowPlan, parseNoShowAction, parseSafetyLevel, safetyPlan } from "./exception-resolve";

const AT = new Date("2026-10-20T12:00:00Z");
const ADMIN = "11111111-1111-4111-8111-111111111111";

describe("예외 닫기 (A5: 상태·누가·언제·무엇이 남는다)", () => {
  it("exceptions에는 resolved·resolved_by·resolved_at·resolution, status_events에는 open → resolved 한 줄", () => {
    const p = closePlan("ex1", ADMIN, "식당 재배정", AT);
    expect(p.update).toEqual({ status: "resolved", resolution: "식당 재배정", resolved_by: ADMIN, resolved_at: "2026-10-20T12:00:00.000Z" });
    expect(p.event).toEqual({ entityType: "exception", entityId: "ex1", field: "status", from: "open", to: "resolved", actor: `admin:${ADMIN}`, reason: "식당 재배정" });
  });
});

describe("노쇼 후보 처리 계획", () => {
  it("노쇼 확정: 출석 NO_SHOW, 신청·예외 이력 두 줄, 제재 걸기", () => {
    const p = noShowPlan({ exceptionId: "ex1", appId: "a1", attendance: "SCHEDULED", action: "noshow", adminId: ADMIN, note: "", at: AT });
    expect(p.application).toEqual({ attendance_status: "NO_SHOW" });
    expect(p.exception).toMatchObject({ status: "resolved", resolved_by: ADMIN, resolution: "노쇼 확정" });
    expect(p.events).toEqual([
      { entityType: "application", entityId: "a1", field: "attendance_status", from: "SCHEDULED", to: "NO_SHOW", actor: `admin:${ADMIN}`, reason: "운영자 확인" },
      { entityType: "exception", entityId: "ex1", field: "status", from: "open", to: "resolved", actor: `admin:${ADMIN}`, reason: "노쇼 확정" },
    ]);
    expect(p.applyPolicy).toBe(true);
  });
  it("참석으로 정정: 출석 ATTENDED, 메모가 사유로, 제재 없음", () => {
    const p = noShowPlan({ exceptionId: "ex1", appId: "a1", attendance: "SCHEDULED", action: "attended", adminId: ADMIN, note: " 단체방에서 확인 ", at: AT });
    expect(p.application).toEqual({ attendance_status: "ATTENDED" });
    expect(p.events[0]).toMatchObject({ to: "ATTENDED", reason: "단체방에서 확인" });
    expect(p.exception.resolution).toBe("참석으로 정정");
    expect(p.applyPolicy).toBe(false);
  });
  it("이미 처리된 신청은 출석을 바꾸지 않고 예외만 닫는다(제재 두 번 방지)", () => {
    const p = noShowPlan({ exceptionId: "ex1", appId: "a1", attendance: "NO_SHOW", action: "noshow", adminId: ADMIN, at: AT });
    expect(p.application).toBeNull();
    expect(p.applyPolicy).toBe(false);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]).toMatchObject({ entityType: "exception", to: "resolved", reason: "이미 처리된 신청이라 상태는 바꾸지 않음" });
    expect(p.exception.resolved_by).toBe(ADMIN);
  });
  it("버튼 값은 noshow·attended만", () => {
    expect(parseNoShowAction("noshow")).toBe("noshow");
    expect(parseNoShowAction("attended")).toBe("attended");
    expect(parseNoShowAction("ban")).toBeNull();
    expect(parseNoShowAction(null)).toBeNull();
  });
});

describe("한꺼번에 처리", () => {
  const rows = [
    { id: "e1", kind: "no_show", ref_type: "application", status: "open" },
    { id: "e2", kind: "no_show", ref_type: "application", status: "resolved" },
    { id: "e3", kind: "no_show", ref_type: "user", status: "open" },
    { id: "e4", kind: "refund", ref_type: "application", status: "open" },
    { id: "e5", kind: "no_show", ref_type: "application", status: "open" },
  ];
  it("열린 신청 노쇼 후보만, 중복은 한 번", () => {
    const r = bulkNoShowTargets(["e1", "e2", "e3", "e4", "e5", "e1", "없음"], rows);
    expect(r.targets.map((x) => x.id)).toEqual(["e1", "e5"]);
    expect(r.skipped).toBe(4);
  });
  it("결과 안내", () => {
    expect(bulkNoShowMessage("noshow", 3, 0, 0)).toBe("3건 노쇼로 확정했어요");
    expect(bulkNoShowMessage("attended", 2, 1, 1)).toBe("2건 참석으로 정정했어요. 1건은 이미 출석이 처리된 신청이라 상태는 그대로 두고 닫았어요. 1건은 이미 처리됐거나 노쇼 후보가 아니라 건너뛰었어요");
    expect(bulkNoShowMessage("noshow", 0, 0, 2)).toBe("2건은 이미 처리됐거나 노쇼 후보가 아니라 건너뛰었어요");
  });
});

describe("안전 신고 검토 (A10)", () => {
  const at = new Date("2026-10-20T03:00:00Z");
  const base = { exceptionId: "ex1", reportId: "r1", reportedId: "u2", adminId: "a1", at };
  it("참가 제한: 신고는 검토함, 계정 상태와 이력, 예외 닫힘", () => {
    const p = safetyPlan({ ...base, currentStatus: "active", level: "restricted", note: "폭언 확인" });
    expect(p.report).toMatchObject({ status: "reviewed", action: "restricted", admin_note: "폭언 확인" });
    expect(p.user).toEqual({ account_status: "restricted" });
    expect(p.userEvent).toMatchObject({ entityType: "user", entityId: "u2", field: "account_status", from: "active", to: "restricted", actor: "admin:a1", reason: "폭언 확인" });
    expect(p.close.update).toMatchObject({ status: "resolved", resolved_by: "a1", resolution: "신고 검토: 참가 제한" });
  });
  it("경고는 warned로, 조치 없음은 계정을 건드리지 않는다", () => {
    expect(safetyPlan({ ...base, currentStatus: "active", level: "warning" }).user).toEqual({ account_status: "warned" });
    const none = safetyPlan({ ...base, currentStatus: "active", level: parseSafetyLevel("x") });
    expect(none.user).toBeNull();
    expect(none.close.update.resolution).toBe("신고 검토: 조치 없음");
  });
  it("이미 영구 제한인 사람을 경고로 내리지 않는다", () => {
    const p = safetyPlan({ ...base, currentStatus: "banned", level: "warning" });
    expect(p.user).toBeNull();
    expect(p.userEvent).toBeNull();
    expect(p.close.update.resolution).toContain("이미 영구 제한 상태라 그대로 둠");
  });
});
