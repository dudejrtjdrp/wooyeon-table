// 신청자 목록(/admin/applicants) 거르기. DB를 읽지 않는 순수 함수만 둔다 (applicant-filter.test.ts)
// PRD 11장 신청자 목록: 프로필, 희망 일정, 결제 상태, 이전 참석·신고 이력 조회와 필터.
// 화면과 CSV(/api/admin/export)가 같은 거르기를 쓴다. 실제 쿼리는 applicant-query.ts가 옮긴다.
import { ATTEND, MATCH, PAYMENT } from "./labels";

/** 매칭 상태 칸에만 있는 묶음: 대안을 아직 안 고른 사람, 신청을 취소한 사람 */
export const MATCH_EXTRA: Record<string, string> = { CHOOSING: "다른 방법 아직 안 고름", CANCELED: "신청 취소" };

/** 참석 칸의 '아직 없음'(확정 전이거나 참석 기록이 안 생긴 신청) */
export const ATTEND_NONE = "NONE";

/** 이전 이력 거르기. 이번 회차 말고 다른 회차 기록을 본다 */
export const HISTORY = [
  { key: "first", label: "이전 참가 기록 없음" },
  { key: "returning", label: "전에 참석한 사람" },
  { key: "noshow", label: "전에 노쇼 있음" },
  { key: "report", label: "받은 신고 있음" },
] as const;
export type HistoryKey = (typeof HISTORY)[number]["key"];

export interface ApplicantFilter {
  /** 회차 id. 없으면 화면이 첫 회차를 고른다 */
  r?: string;
  /** 매칭 상태 (MATCH 키 또는 CHOOSING·CANCELED) */
  s?: string;
  /** 결제 상태 (PAYMENT 키) */
  pay?: string;
  /** 참석 상태 (ATTEND 키 또는 NONE) */
  att?: string;
  /** 희망 일정의 동네 */
  region?: string;
  hist?: HistoryKey;
  /** 이름이나 로그인 ID 일부 */
  q?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseApplicantFilter(sp: Record<string, string | string[] | undefined>): ApplicantFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const r = one("r");
  const s = one("s");
  const pay = one("pay");
  const att = one("att");
  const hist = one("hist");
  return {
    r: r && UUID.test(r) ? r : undefined,
    s: s && (Object.hasOwn(MATCH, s) || Object.hasOwn(MATCH_EXTRA, s)) ? s : undefined,
    pay: pay && Object.hasOwn(PAYMENT, pay) ? pay : undefined,
    att: att && (Object.hasOwn(ATTEND, att) || att === ATTEND_NONE) ? att : undefined,
    region: one("region")?.slice(0, 30),
    hist: HISTORY.some((h) => h.key === hist) ? (hist as HistoryKey) : undefined,
    q: one("q")?.slice(0, 40),
  };
}

/** 회차 말고 거른 조건이 하나라도 있나 */
export const applicantFiltered = (f: ApplicantFilter) => Boolean(f.s || f.pay || f.att || f.region || f.hist || f.q);

/** 거르기를 주소 쿼리로 (CSV 링크·공유 주소가 같은 거르기를 쓴다) */
export function applicantSearch(f: ApplicantFilter): string {
  const p = new URLSearchParams();
  for (const k of ["r", "s", "pay", "att", "region", "hist", "q"] as const) if (f[k]) p.set(k, f[k]!);
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** DB에서 바로 거를 수 있는 조건 (같은 칸 eq) */
export function applicantDbFilter(f: ApplicantFilter): { matchEq?: string; appStatusEq?: string; payEq?: string; attEq?: string; attNull?: boolean } {
  const out: ReturnType<typeof applicantDbFilter> = {};
  if (f.s === "CHOOSING") out.matchEq = "ALTERNATIVE_OFFERED";
  else if (f.s === "CANCELED") out.appStatusEq = "CANCELED";
  else if (f.s) out.matchEq = f.s;
  if (f.pay) out.payEq = f.pay;
  if (f.att === ATTEND_NONE) out.attNull = true;
  else if (f.att) out.attEq = f.att;
  return out;
}

export interface ApplicantLike {
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
  application_status: string;
  resolution: string | null;
  users: { name: string; login_id: string | null };
  application_slots: { slots: { region: string } | null }[];
}

export interface ApplicantHistory {
  /** 다른 회차에서 참석한 횟수 */
  attended: number;
  /** 다른 회차에서 노쇼한 횟수 */
  noShows: number;
  /** 받은 신고 수 */
  reports: number;
}

/** 한 신청이 거르기에 맞는지. DB 조건도 한 번 더 본다(같은 함수로 화면·CSV가 어긋나지 않게) */
export function applicantMatches(a: ApplicantLike, f: ApplicantFilter, h: ApplicantHistory): boolean {
  const db = applicantDbFilter(f);
  if (db.matchEq && a.match_status !== db.matchEq) return false;
  // CHOOSING: 대시보드 '대체 일정·환불 선택 대기'와 같은 기준(자리 기다리기를 고른 사람 제외)
  if (f.s === "CHOOSING" && a.resolution === "wait") return false;
  if (db.appStatusEq && a.application_status !== db.appStatusEq) return false;
  if (db.payEq && a.payment_status !== db.payEq) return false;
  if (db.attEq && a.attendance_status !== db.attEq) return false;
  if (db.attNull && a.attendance_status) return false;
  if (f.region && !a.application_slots.some((x) => x.slots?.region === f.region)) return false;
  if (f.q && !(a.users.name.includes(f.q) || (a.users.login_id ?? "").includes(f.q))) return false;
  if (f.hist === "first" && (h.attended > 0 || h.noShows > 0)) return false;
  if (f.hist === "returning" && h.attended === 0) return false;
  if (f.hist === "noshow" && h.noShows === 0) return false;
  if (f.hist === "report" && h.reports === 0) return false;
  return true;
}

/** CSV 내려받기 이력에 남길 거르기 설명 */
export function describeApplicantFilter(f: ApplicantFilter, roundTitle?: string): string {
  const parts: string[] = [];
  if (f.r) parts.push(`회차 ${roundTitle ?? `#${f.r.slice(0, 6)}`}`);
  if (f.s) parts.push(`매칭 ${MATCH_EXTRA[f.s] ?? MATCH[f.s][0]}`);
  if (f.pay) parts.push(`결제 ${PAYMENT[f.pay][0]}`);
  if (f.att) parts.push(`참석 ${f.att === ATTEND_NONE ? "아직 없음" : ATTEND[f.att][0]}`);
  if (f.region) parts.push(`동네 ${f.region}`);
  if (f.hist) parts.push(HISTORY.find((h) => h.key === f.hist)!.label);
  if (f.q) parts.push(`검색 '${f.q}'`);
  return parts.length ? parts.join(" · ") : "조건 없음(전체)";
}

/**
 * 신청자 표 '다른 회차 참석·노쇼' 칸. 숫자에 단위를 붙이고 노쇼가 있으면 경고로 (예: 참석 3회 · 노쇼 1회).
 * 둘 다 0이면 첫 신청
 */
export function pastAttendance(h: Pick<ApplicantHistory, "attended" | "noShows">): { first: boolean; attended: string; noShows: string | null; warn: boolean } {
  if (!h.attended && !h.noShows) return { first: true, attended: "첫 신청", noShows: null, warn: false };
  return { first: false, attended: `참석 ${h.attended}회`, noShows: h.noShows ? `노쇼 ${h.noShows}회` : null, warn: h.noShows > 0 };
}
