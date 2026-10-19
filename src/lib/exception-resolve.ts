// 예외 처리의 '무엇을 바꾸고 무엇을 남기나'. DB를 건드리지 않는 순수 함수만 둔다 (exception-resolve.test.ts)
// 실제 쓰기는 app/admin/exceptions/actions.ts가 이 계획을 그대로 옮긴다

/** status_events 한 줄 (lib/events.ts logStatus 입력과 같은 모양) */
export interface StatusEventPlan {
  entityType: string;
  entityId: string;
  field: string;
  from: string | null;
  to: string;
  actor: string;
  reason: string;
}

/** 예외를 닫을 때 exceptions에 쓸 값과 처리 이력 한 줄. 누가(resolved_by)·언제(resolved_at)·무엇(resolution) */
export function closePlan(exceptionId: string, adminId: string, resolution: string, at: Date) {
  return {
    update: { status: "resolved" as const, resolution, resolved_by: adminId, resolved_at: at.toISOString() },
    event: { entityType: "exception", entityId: exceptionId, field: "status", from: "open", to: "resolved", actor: `admin:${adminId}`, reason: resolution } satisfies StatusEventPlan,
  };
}

export type NoShowAction = "noshow" | "attended";
export const parseNoShowAction = (v: unknown): NoShowAction | null => (v === "noshow" || v === "attended" ? v : null);

/**
 * 노쇼 후보 한 건 처리 계획.
 * 신청이 아직 '참석 예정'일 때만 출석 상태를 바꾼다(이미 처리된 신청은 그대로 두어 노쇼 제재가 두 번 걸리지 않게). 예외는 어느 쪽이든 닫는다
 */
export function noShowPlan(o: { exceptionId: string; appId: string; attendance: string | null; action: NoShowAction; adminId: string; note?: string; at: Date }) {
  const to = o.action === "attended" ? "ATTENDED" : "NO_SHOW";
  const change = o.attendance === "SCHEDULED";
  const resolution = !change ? "이미 처리된 신청이라 상태는 바꾸지 않음" : to === "NO_SHOW" ? "노쇼 확정" : "참석으로 정정";
  const close = closePlan(o.exceptionId, o.adminId, resolution, o.at);
  const appEvent: StatusEventPlan | null = change
    ? { entityType: "application", entityId: o.appId, field: "attendance_status", from: "SCHEDULED", to, actor: `admin:${o.adminId}`, reason: o.note?.trim() || "운영자 확인" }
    : null;
  return {
    /** applications에 쓸 값. null이면 바꾸지 않는다 */
    application: change ? { attendance_status: to } : null,
    exception: close.update,
    /** 처리 이력: 신청 출석 변경(있으면) → 예외 닫힘 순서 */
    events: [...(appEvent ? [appEvent] : []), close.event],
    /** 노쇼로 바뀌었을 때만 횟수별 경고·제한을 건다 */
    applyPolicy: change && to === "NO_SHOW",
    resolution,
  };
}

/**
 * 여러 건 한꺼번에: 열린 '신청' 노쇼 후보만 받는다. 3회 이상 영구 제한 검토(ref_type=user)와 이미 닫힌 건은 건너뛴다.
 * 같은 id가 두 번 와도 한 번만 처리한다
 */
export function bulkNoShowTargets<T extends { id: string; kind: string; ref_type: string; status: string }>(ids: string[], rows: T[]): { targets: T[]; skipped: number } {
  const want = [...new Set(ids.filter(Boolean))];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const targets = want.map((id) => byId.get(id)).filter((r): r is T => !!r && r.kind === "no_show" && r.ref_type === "application" && r.status === "open");
  return { targets, skipped: want.length - targets.length };
}

/** 한꺼번에 처리한 결과 안내 */
export function bulkNoShowMessage(action: NoShowAction, done: number, unchanged: number, skipped: number): string {
  const verb = action === "noshow" ? "노쇼로 확정했어요" : "참석으로 정정했어요";
  const parts = done ? [`${done}건 ${verb}`] : [];
  if (unchanged) parts.push(`${unchanged}건은 이미 출석이 처리된 신청이라 상태는 그대로 두고 닫았어요`);
  if (skipped) parts.push(`${skipped}건은 이미 처리됐거나 노쇼 후보가 아니라 건너뛰었어요`);
  return parts.join(". ");
}
