// 자동 매칭 모니터(/admin/matching)의 요약 숫자와 '못 든 사람' 사유. DB를 읽지 않는 순수 함수만 둔다 (match-monitor.test.ts)
// 숫자는 대시보드와 같은 기준으로 센다: 확정은 지금 확정 상태인 신청, 재배치는 지표(metrics.ts realloc_success)의 분자, 해제는 아래 목록에 보이는 해제 테이블

export interface MonitorCount {
  /** 화면에 보일 숫자 */
  n: number;
  /** 실행 기록(match_runs.summary)과 다르면 그 차이를 풀어 쓴 말. 같으면 undefined */
  diff?: string;
}

export function monitorCounts(o: {
  summary: Record<string, unknown>;
  apps: { match_status: string }[];
  tables: { status: string }[];
  /** 대시보드 '자동 재배치 성공률'의 분자 (운영자 손 없이 재배치로 확정된 사람) */
  reallocOk: number;
}): { confirmed: MonitorCount; reallocated: MonitorCount; dissolved: MonitorCount } {
  const st = (k: string) => Number(o.summary[k] ?? 0) || 0;
  const confirmed = o.apps.filter((a) => a.match_status === "CONFIRMED").length;
  const dissolved = o.tables.filter((t) => t.status === "DISSOLVED").length;
  const runC = st("confirmed");
  const runR = st("reallocated");
  const runD = st("dissolved");
  return {
    confirmed: { n: confirmed, diff: runC !== confirmed ? `매칭을 돌린 때는 ${runC}명이 확정됐어요. 그 뒤 취소·이동·긴급 수정으로 지금은 ${confirmed}명이에요. 대시보드도 지금 기준으로 세요.` : undefined },
    reallocated: { n: o.reallocOk, diff: runR !== o.reallocOk ? `실행 기록에는 재배치 ${runR}명이에요. 대시보드와 같이, 처음 조합에서 떨어졌다가 운영자 손 없이 다른 테이블에 확정된 사람만 셌어요.` : undefined },
    dissolved: { n: dissolved, diff: runD !== dissolved ? `매칭 중 해제 ${runD}번, 그 뒤 운영자 긴급 수정으로 해제 ${Math.max(0, dissolved - runD)}번이에요.` : undefined },
  };
}

export interface FailApp {
  match_status: string;
  match_reason: string | null;
  application_status?: string | null;
  payment_status?: string | null;
  resolution?: string | null;
  realloc_count?: number;
}

/** 상태 이력 중 '못 든 사람' 시각을 고를 때 보는 줄 */
export interface FailEvent { field: string; to_value: string; created_at: string }

const PAY_NOTE: Record<string, string> = { REFUNDED: "환불 완료", REFUND_FAILED: "환불 실패", REFUND_PROCESSING: "환불 중", REFUND_REQUESTED: "환불 요청됨" };

/**
 * 못 든 사람 한 명의 사유와 시각. 사유 칸이 비어 있어도 상태로 늘 한 줄을 채운다.
 * 시각은 그 상태가 된 기록(취소·실패 안내·이동·종료), 없으면 매칭 실행이 끝난 시각
 */
export function failNote(a: FailApp, events: FailEvent[], runFinishedAt?: string | null): { reason: string; label: string; at: string | null } {
  const last = (pred: (e: FailEvent) => boolean) => [...events].filter(pred).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.created_at ?? null;
  const pay = a.payment_status ? PAY_NOTE[a.payment_status] : undefined;
  const canceled = a.application_status === "CANCELED";
  let reason: string;
  let label: string;
  let at: string | null;
  if (canceled) {
    reason = `결제 뒤 매칭 전에 취소${pay ? ` (${pay})` : ""}`;
    label = "취소";
    at = last((e) => e.field === "application_status" && e.to_value === "CANCELED");
  } else if (a.match_status === "TRANSFERRED") {
    reason = "다른 일정으로 옮겼어요";
    label = "이동";
    at = last((e) => e.field === "match_status" && e.to_value === "TRANSFERRED");
  } else if (a.match_status === "EXCEPTION") {
    reason = "신청 정보가 빠져 매칭에서 뺐어요. 예외 처리함에서 확인해 주세요";
    label = "예외";
    at = last((e) => e.field === "match_status" && e.to_value === "EXCEPTION");
  } else if (a.match_status === "ALTERNATIVE_OFFERED") {
    reason = `조건에 맞는 테이블을 꾸리지 못해 다른 일정·보관·환불을 안내했어요${a.realloc_count ? ` (재배치 ${a.realloc_count}번 시도)` : ""}`;
    label = "실패 안내";
    at = last((e) => e.field === "match_status" && e.to_value === "ALTERNATIVE_OFFERED");
  } else {
    const how = a.resolution === "keep_pass" ? "이용권으로 보관했어요" : a.resolution === "refund" ? `환불을 골랐어요${pay ? ` (${pay})` : ""}` : a.resolution === "transfer" ? "다른 일정으로 옮겼어요" : "이번 회차는 매칭되지 않고 끝났어요";
    reason = `테이블을 꾸리지 못했고, ${how}`;
    label = "종료";
    at = last((e) => e.field === "match_status" && (e.to_value === "NO_MATCH" || e.to_value === "ALTERNATIVE_OFFERED"));
  }
  // 운영자가 적어 둔 사유가 있으면 그것을 먼저 쓴다(취소는 상태가 더 정확하다)
  if (a.match_reason && !canceled) reason = a.match_reason;
  if (!at && runFinishedAt) return { reason, label: "매칭 실행", at: runFinishedAt };
  return { reason, label, at };
}
