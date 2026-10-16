// PRD 3장 핵심 지표 13개. 정의(분자·분모)는 PRD 문구를 그대로 옮기고, 우리 데이터에서 무엇을 세는지 함께 적는다.
// 계산은 DB와 떨어진 순수 함수라 테스트로 바로 확인한다. 데이터를 읽는 쪽은 src/app/admin/metrics/load.ts

export type MetricGroup = "획득·전환" | "매칭 품질" | "반복 참여" | "운영 효율";

export interface MetricApp {
  id: string;
  user_id: string;
  round_id: string;
  application_status: string;
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
  realloc_count: number;
  resolution: string | null;
  submitted_at: string | null;
}

export interface MetricTable {
  id: string;
  round_id: string;
  confirmed_at: string | null;
  /** explanation.origin. 'admin_split'이면 운영자가 나눠서 만든 테이블 */
  origin?: string | null;
}

export interface MetricException {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  /** 예외가 속한 회차. 알 수 없으면 null (회차별 보기에서 빠진다) */
  round_id?: string | null;
}

export interface MetricEvent {
  entity_type: string;
  entity_id: string;
  field: string;
  to_value: string;
  actor: string;
  match_run_id?: string | null;
}

export interface MetricRound {
  id: string;
  /** 회차 순서를 정하는 시각(자동 매칭 실행 시각) */
  match_at: string;
}

export interface MetricsInput {
  apps: MetricApp[];
  tables: MetricTable[];
  exceptions: MetricException[];
  /** 운영자(actor admin:*)가 남긴 상태 변경과, 매칭 실행 중 실패(ALTERNATIVE_OFFERED) 기록 */
  events: MetricEvent[];
  /** 후기를 남긴 신청 id */
  feedbackAppIds: string[];
  rounds: MetricRound[];
}

export interface Metric {
  key: string;
  name: string;
  group: MetricGroup;
  /** PRD 정의 */
  definition: string;
  /** 우리 데이터에서 세는 방법 */
  how: string;
  numeratorLabel: string;
  denominatorLabel: string;
  numerator: number;
  denominator: number;
  /** 비율(0~1) 또는 분(운영 시간). 분모가 0이면 null */
  value: number | null;
  unit: "ratio" | "minutes";
  /** 높을수록 좋은 지표인지 (노쇼율·개입률·운영 시간은 낮을수록 좋다) */
  higherIsBetter: boolean;
  /** 값 아래에 붙이는 보조 설명 */
  sub?: string;
  /** 운영 시간: 회차별 처리 시간 합계(PRD '한 회차의 예외를 처리하는 데 사용한 시간'). 회차를 모르는 예외는 빠진다 */
  perRound?: { roundId: string; minutes: number; count: number }[];
}

const PAID_LIKE = (s: string) => !["PENDING", "FAILED"].includes(s);
const REFUND_CHOSEN = ["REFUND_REQUESTED", "REFUND_PROCESSING", "REFUNDED", "REFUND_FAILED"];
const FAILED_MATCH = ["ALTERNATIVE_OFFERED", "TRANSFERRED", "NO_MATCH"];
const isAdmin = (actor: string) => actor.startsWith("admin:") && actor !== "admin:demo";
const submitted = (a: MetricApp) => a.application_status !== "DRAFT" && !!a.submitted_at;
/** 테이블이 한 번이라도 확정된 신청. 확정 뒤 참석 상태가 붙으므로 참석 값이 있으면 확정됐던 것 */
const everConfirmed = (a: MetricApp) => a.match_status === "CONFIRMED" || (a.attendance_status !== null && a.attendance_status !== undefined);
/** 매칭이 끝난 신청(대기·진행 중이 아님) */
const matchDone = (a: MetricApp) => !["WAITING", "MATCHING", "REALLOCATING"].includes(a.match_status);

function ratio(n: number, d: number) {
  return d > 0 ? n / d : null;
}

/** 지표 13개를 계산한다. roundId를 주면 그 회차만 본다(재방문율은 이후 회차를 보므로 회차 밖 신청도 쓴다) */
export function computeMetrics(input: MetricsInput, roundId?: string): Metric[] {
  const inRound = <T extends { round_id?: string | null }>(x: T) => !roundId || x.round_id === roundId;
  const apps = input.apps.filter(inRound);
  const tables = input.tables.filter(inRound);
  const exceptions = input.exceptions.filter(inRound);

  const adminEventsBy = new Map<string, MetricEvent[]>();
  const failedAtRun = new Set<string>();
  for (const e of input.events) {
    if (isAdmin(e.actor)) {
      const k = `${e.entity_type}:${e.entity_id}`;
      if (!adminEventsBy.has(k)) adminEventsBy.set(k, []);
      adminEventsBy.get(k)!.push(e);
    }
    if (e.entity_type === "application" && e.field === "match_status" && e.to_value === "ALTERNATIVE_OFFERED" && e.match_run_id) failedAtRun.add(e.entity_id);
  }
  const touchedByAdmin = (type: string, id: string, field?: string, to?: string) =>
    (adminEventsBy.get(`${type}:${id}`) ?? []).some((e) => (!field || e.field === field) && (!to || e.to_value === to));

  // 1. 신청 완료율
  const sub = apps.filter(submitted);
  // 2. 결제 전환율
  const paid = sub.filter((a) => PAID_LIKE(a.payment_status));
  // 3. 매칭 성공률
  const paidDone = paid.filter(matchDone);
  const paidConfirmed = paidDone.filter(everConfirmed);
  // 4. 자동 확정률
  const confirmedTables = tables.filter((t) => t.confirmed_at);
  const autoTables = confirmedTables.filter((t) => t.origin !== "admin_split" && !touchedByAdmin("dining_table", t.id));
  // 5. 자동 재배치 성공률: 첫 조합에서 떨어져 재배치에 들어간 사람(재배치 1회 이상이거나 매칭 실행에서 실패한 사람)
  const reallocTried = apps.filter((a) => a.realloc_count > 0 || failedAtRun.has(a.id));
  const reallocOk = reallocTried.filter((a) => everConfirmed(a) && a.realloc_count > 0 && !touchedByAdmin("application", a.id, "table_id"));
  // 6. 대체 일정 전환율
  const failed = apps.filter((a) => FAILED_MATCH.includes(a.match_status) || failedAtRun.has(a.id));
  const transferred = failed.filter((a) => a.match_status === "TRANSFERRED" || a.resolution === "transfer");
  // 7. 자동 환불 완료율
  const refundChosen = apps.filter((a) => REFUND_CHOSEN.includes(a.payment_status));
  const refundAuto = refundChosen.filter((a) => a.payment_status === "REFUNDED" && !touchedByAdmin("application", a.id, "payment_status", "REFUNDED"));
  // 8. 실제 참가 전환율
  const attended = apps.filter((a) => a.attendance_status === "ATTENDED");
  // 9. 노쇼율: 확정자 중 참석 여부가 정해진 사람(모임이 끝나기 전 '참석 예정'은 아직 모르므로 뺀다)
  const decided = apps.filter((a) => a.attendance_status && a.attendance_status !== "SCHEDULED");
  const noShow = decided.filter((a) => a.attendance_status === "NO_SHOW");
  // 10. 재방문율
  const roundAt = new Map(input.rounds.map((r) => [r.id, r.match_at]));
  const attendedUsers = new Map<string, string>(); // user → 가장 이른 참석 회차 시각
  for (const a of attended) {
    const at = roundAt.get(a.round_id) ?? "";
    const cur = attendedUsers.get(a.user_id);
    if (!cur || at < cur) attendedUsers.set(a.user_id, at);
  }
  const revisit = [...attendedUsers.entries()].filter(([uid, at]) =>
    input.apps.some((x) => x.user_id === uid && submitted(x) && (roundAt.get(x.round_id) ?? "") > at),
  );
  // 11. 피드백 응답률
  const fb = new Set(input.feedbackAppIds);
  const answered = attended.filter((a) => fb.has(a.id));
  // 12. 운영자 개입률
  const byAdmin = exceptions.filter((e) => e.status === "resolved" && e.resolved_by);
  // 13. 운영 시간
  const minutes = byAdmin.filter((e) => e.resolved_at).map((e) => Math.max(0, (Date.parse(e.resolved_at!) - Date.parse(e.created_at)) / 60_000));
  const totalMin = minutes.reduce((s, x) => s + x, 0);
  const perRoundMap = new Map<string, { minutes: number; count: number }>();
  for (const e of byAdmin) {
    if (!e.round_id || !e.resolved_at) continue;
    const cur = perRoundMap.get(e.round_id) ?? { minutes: 0, count: 0 };
    cur.minutes += Math.max(0, (Date.parse(e.resolved_at) - Date.parse(e.created_at)) / 60_000);
    cur.count++;
    perRoundMap.set(e.round_id, cur);
  }
  const roundOrder = new Map(input.rounds.map((r) => [r.id, r.match_at]));
  const perRound = [...perRoundMap.entries()]
    .map(([id, v]) => ({ roundId: id, minutes: Math.round(v.minutes), count: v.count }))
    .sort((a, b) => (roundOrder.get(a.roundId) ?? "").localeCompare(roundOrder.get(b.roundId) ?? ""));
  const roundsWithEx = perRound.length;
  const opsSub = roundId
    ? minutes.length ? `이 회차 처리 시간 합계 ${fmtMinutes(totalMin)} (${minutes.length}건)` : undefined
    : roundsWithEx ? `회차당 처리 시간 합계 평균 ${fmtMinutes(perRound.reduce((n, x) => n + x.minutes, 0) / roundsWithEx)} (${roundsWithEx}회차)` : undefined;

  const m = (x: Omit<Metric, "value" | "unit" | "higherIsBetter"> & { unit?: Metric["unit"]; higherIsBetter?: boolean; value?: number | null }): Metric => ({
    unit: "ratio",
    higherIsBetter: true,
    value: x.value === undefined ? ratio(x.numerator, x.denominator) : x.value,
    ...x,
  });

  return [
    m({ key: "apply_complete", name: "신청 완료율", group: "획득·전환", definition: "신청을 시작한 사용자 중 제출을 완료한 비율", how: "신청서를 만든 건(작성 중 포함) 중 제출까지 마친 건", numeratorLabel: "제출한 신청", denominatorLabel: "시작한 신청", numerator: sub.length, denominator: apps.length }),
    m({ key: "pay_conversion", name: "결제 전환율", group: "획득·전환", definition: "신청 완료자 중 결제 완료자가 된 비율", how: "제출한 신청 중 결제가 끝난 건(이후 환불된 건 포함)", numeratorLabel: "결제 완료", denominatorLabel: "제출한 신청", numerator: paid.length, denominator: sub.length }),
    m({ key: "attend_conversion", name: "실제 참가 전환율", group: "획득·전환", definition: "신청자 중 실제 행사에 참여한 비율", how: "제출한 신청 중 체크인까지 한 건", numeratorLabel: "체크인", denominatorLabel: "제출한 신청", numerator: attended.length, denominator: sub.length }),
    m({ key: "match_success", name: "매칭 성공률", group: "매칭 품질", definition: "결제 완료자 중 테이블이 확정된 비율", how: "매칭이 끝난 결제 완료자 중 테이블이 한 번이라도 확정된 사람", numeratorLabel: "테이블 확정", denominatorLabel: "매칭이 끝난 결제 완료자", numerator: paidConfirmed.length, denominator: paidDone.length }),
    m({ key: "realloc_success", name: "자동 재배치 성공률", group: "매칭 품질", definition: "최초 조합 실패자 중 다른 적합한 테이블에 자동 배치된 비율", how: "첫 조합에서 떨어진 사람(재배치 1회 이상이거나 매칭 실행에서 실패) 중 운영자 손 없이 다른 테이블에 확정된 사람", numeratorLabel: "자동 재배치로 확정", denominatorLabel: "첫 조합에서 떨어진 사람", numerator: reallocOk.length, denominator: reallocTried.length }),
    m({ key: "alt_conversion", name: "대체 일정 전환율", group: "매칭 품질", definition: "매칭 실패자 중 추천된 다른 일정으로 이동한 비율", how: "매칭 실패 안내를 받은 사람 중 '다른 일정으로 옮기기'를 고른 사람", numeratorLabel: "다른 일정으로 이동", denominatorLabel: "매칭 실패자", numerator: transferred.length, denominator: failed.length }),
    m({ key: "no_show", name: "노쇼율", group: "매칭 품질", definition: "매칭 확정자 중 사전 취소 없이 불참한 비율", how: "확정된 사람 중 참석 여부가 정해진 사람(참석·노쇼·취소) 중 노쇼로 확정된 사람. 모임 전 '참석 예정'은 뺀다", numeratorLabel: "노쇼", denominatorLabel: "참석 여부가 정해진 확정자", numerator: noShow.length, denominator: decided.length, higherIsBetter: false }),
    m({ key: "revisit", name: "재방문율", group: "반복 참여", definition: "실제 참가자 중 이후 일정에 다시 신청한 고유 사용자 비율", how: "체크인한 적 있는 사람(한 명은 한 번만) 중 그 뒤 회차에 다시 신청을 제출한 사람", numeratorLabel: "다시 신청한 사람", denominatorLabel: "참가한 사람", numerator: revisit.length, denominator: attendedUsers.size }),
    m({ key: "feedback", name: "피드백 응답률", group: "반복 참여", definition: "실제 참가자 중 피드백을 완료한 비율", how: "체크인한 신청 중 후기를 제출한 건", numeratorLabel: "후기 제출", denominatorLabel: "체크인", numerator: answered.length, denominator: attended.length }),
    m({ key: "auto_confirm", name: "자동 확정률", group: "운영 효율", definition: "확정된 테이블 중 운영자 개입 없이 자동 확정된 비율", how: "확정된 테이블 중 운영자가 이동·분리·병합·해제로 손대지 않은 테이블", numeratorLabel: "자동 확정 테이블", denominatorLabel: "확정된 테이블", numerator: autoTables.length, denominator: confirmedTables.length }),
    m({ key: "auto_refund", name: "자동 환불 완료율", group: "운영 효율", definition: "환불 선택 건 중 운영자 개입 없이 환불 완료된 비율", how: "환불을 고른 건(요청·처리 중·완료·실패) 중 운영자가 다시 시도하지 않고 환불이 끝난 건", numeratorLabel: "자동 환불 완료", denominatorLabel: "환불 선택", numerator: refundAuto.length, denominator: refundChosen.length }),
    m({ key: "intervention", name: "운영자 개입률", group: "운영 효율", definition: "전체 신청 건 중 운영자가 직접 처리한 예외 건의 비율", how: "운영자가 처리 완료한 예외 건수 ÷ 제출한 신청 건수", numeratorLabel: "운영자가 처리한 예외", denominatorLabel: "제출한 신청", numerator: byAdmin.length, denominator: sub.length, higherIsBetter: false }),
    m({
      key: "ops_time", name: "운영 시간", group: "운영 효율", unit: "minutes", higherIsBetter: false,
      definition: "운영자가 한 회차의 예외를 처리하는 데 사용한 시간",
      how: "운영자가 처리한 예외마다 올라온 시각부터 처리 완료 시각까지 걸린 시간. 큰 숫자는 건당 평균이고, 회차별 합계(한 회차 처리 시간)를 함께 적는다. 실제 작업 시간은 따로 재지 않아서 처리까지 걸린 시간으로 대신한다",
      numeratorLabel: "걸린 시간 합계(분)", denominatorLabel: "처리한 예외", numerator: Math.round(totalMin), denominator: minutes.length,
      value: minutes.length ? totalMin / minutes.length : null,
      sub: opsSub,
      perRound,
    }),
  ];
}

/** 분을 읽기 쉬운 말로: 45분, 2시간 10분, 1일 3시간 */
export function fmtMinutes(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}일 ${h % 24}시간` : `${d}일`;
}

/** 지표 값을 화면 문구로. 데이터가 없으면 null */
export function metricValue(x: Metric): string | null {
  if (x.value === null) return null;
  if (x.unit === "minutes") return fmtMinutes(x.value);
  const pct = x.value * 100;
  return `${pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
}
