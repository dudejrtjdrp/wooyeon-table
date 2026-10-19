// 결제·환불(/admin/payments) 거르기. DB를 읽지 않는 순수 함수만 둔다 (payment-filter.test.ts)
// 화면·쪽 넘기기·CSV가 모두 같은 거르기를 쓴다. 실제 쿼리는 payment-query.ts가 옮긴다.
import { PAYMENT } from "./labels";
import { kstDayStart } from "./audit";

export const PAYMENT_PAGE_SIZE = 50;

/** 결제 수단: 토스페이먼츠 / 모의 결제(시연) */
export const PAY_METHODS = [
  { key: "toss", label: "토스페이먼츠" },
  { key: "mock", label: "모의 결제" },
] as const;
export type PayMethod = (typeof PAY_METHODS)[number]["key"];

/** 종류: 새로 산 1회권 / 새로 산 멤버십 / 보유 이용권으로 신청(결제 없음) */
export const PAY_KINDS = [
  { key: "single", label: "1회권" },
  { key: "membership", label: "멤버십" },
  { key: "owned", label: "보유 이용권 사용" },
] as const;
export type PayKind = (typeof PAY_KINDS)[number]["key"];

const MEMBERSHIP_TYPES = ["m1", "m3", "m6"];

export interface PaymentFilter {
  /** 참가자 이름 일부 */
  q?: string;
  /** 회차 id */
  r?: string;
  /** 결제 상태 (PAYMENT 키) */
  s?: string;
  method?: PayMethod;
  kind?: PayKind;
  /** YYYY-MM-DD (서울 날짜, 그날 포함) */
  from?: string;
  to?: string;
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDay = (d: string | undefined) => {
  if (!d || !DAY.test(d)) return undefined;
  const t = Date.parse(`${d}T00:00:00+09:00`);
  // 2026-02-31 같은 날은 Date가 다음 달로 넘겨 버려서, 되돌려 같은 날인지 본다
  return !Number.isNaN(t) && new Date(t + 9 * 3_600_000).toISOString().slice(0, 10) === d ? d : undefined;
};

export function parsePaymentFilter(sp: Record<string, string | string[] | undefined>): PaymentFilter {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const q = (one("q") ?? "").trim().slice(0, 40) || undefined;
  const r = one("r");
  const s = one("s");
  const method = one("method");
  const kind = one("kind");
  let from = validDay(one("from"));
  let to = validDay(one("to"));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Math.max(1, Math.min(10000, Math.floor(Number(one("page")) || 1)));
  return {
    q,
    r: r && UUID.test(r) ? r : undefined,
    s: s && Object.hasOwn(PAYMENT, s) ? s : undefined,
    method: PAY_METHODS.some((m) => m.key === method) ? (method as PayMethod) : undefined,
    kind: PAY_KINDS.some((k) => k.key === kind) ? (kind as PayKind) : undefined,
    from,
    to,
    page,
  };
}

/** 쪽 번호 말고 거른 조건이 하나라도 있나 */
export const paymentFiltered = (f: PaymentFilter) => Boolean(f.q || f.r || f.s || f.method || f.kind || f.from || f.to);

/** 거르기를 주소 쿼리로. 1쪽은 생략 */
export function paymentSearch(f: PaymentFilter, page = f.page): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.r) p.set("r", f.r);
  if (f.s) p.set("s", f.s);
  if (f.method) p.set("method", f.method);
  if (f.kind) p.set("kind", f.kind);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (page > 1) p.set("page", String(page));
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** DB 조회에 쓸 조건. 이름·회차는 id를 찾아야 해서 payment-query.ts가 따로 붙인다 */
export interface PaymentQuery {
  /** 서로 맞지 않는 조건(예: 토스 결제 + 보유 이용권 사용)이라 결과가 없다 */
  none: boolean;
  status?: string;
  providerEq?: string;
  providerNeq?: string;
  passTypes?: string[];
  /** PostgREST or() 식. 결제 시각이 있으면 결제 시각, 아직 결제 전이면 만든 시각으로 기간을 본다 */
  periodOr?: string;
  offset: number;
  limit: number;
}

const kstNextDayStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+09:00`) + 86_400_000).toISOString();

export function periodOr(since?: string, until?: string): string | undefined {
  if (!since && !until) return undefined;
  const cond = (col: string) => [since && `${col}.gte.${since}`, until && `${col}.lt.${until}`].filter(Boolean) as string[];
  const paid = cond("paid_at");
  const made = cond("created_at");
  return `${paid.length > 1 ? `and(${paid.join(",")})` : paid[0]},and(paid_at.is.null,${made.join(",")})`;
}

export function paymentQuery(f: PaymentFilter, limit = PAYMENT_PAGE_SIZE): PaymentQuery {
  const q: PaymentQuery = { none: false, offset: (f.page - 1) * limit, limit };
  if (f.s) q.status = f.s;
  if (f.method) q.providerEq = f.method;
  if (f.kind === "owned") {
    if (q.providerEq && q.providerEq !== "pass") q.none = true;
    q.providerEq = "pass";
  } else if (f.kind) {
    q.passTypes = f.kind === "single" ? ["single"] : MEMBERSHIP_TYPES;
    if (!q.providerEq) q.providerNeq = "pass";
  }
  q.periodOr = periodOr(f.from && kstDayStart(f.from), f.to && kstNextDayStart(f.to));
  return q;
}

/** 위 숫자 카드: 결제 완료 금액, 자동 환불 건수·금액, 환불 실패, 보유 이용권 사용 */
export function paymentTotals(rows: { amount: number; status: string; provider: string }[]) {
  const refunded = rows.filter((p) => p.status === "REFUNDED");
  return {
    count: rows.length,
    paidSum: rows.filter((p) => p.status === "PAID").reduce((n, p) => n + p.amount, 0),
    refundedN: refunded.length,
    refundedSum: refunded.reduce((n, p) => n + p.amount, 0),
    failedRefund: rows.filter((p) => p.status === "REFUND_FAILED").length,
    passUses: rows.filter((p) => p.provider === "pass").length,
  };
}

/** 결제 수단 한 칸 (화면·CSV 공통) */
export function methodText(p: { provider: string; method: string | null }) {
  if (p.provider === "toss") return `토스 · ${p.method ?? "카드"}`;
  if (p.provider === "pass") return "-";
  if (p.provider === "mock") return "모의 결제";
  return p.provider;
}

/** CSV 내려받기 이력에 남길 거르기 설명: "회차 10월 4주 · 상태 환불 완료 · 기간 2026-10-01~2026-10-19" */
export function describePaymentFilter(f: PaymentFilter, roundTitle?: string): string {
  const parts: string[] = [];
  if (f.q) parts.push(`이름 '${f.q}'`);
  if (f.r) parts.push(`회차 ${roundTitle ?? `#${f.r.slice(0, 6)}`}`);
  if (f.s) parts.push(`상태 ${PAYMENT[f.s][0]}`);
  if (f.method) parts.push(`수단 ${PAY_METHODS.find((m) => m.key === f.method)!.label}`);
  if (f.kind) parts.push(`종류 ${PAY_KINDS.find((k) => k.key === f.kind)!.label}`);
  if (f.from || f.to) parts.push(`기간 ${f.from ?? "처음"}~${f.to ?? "오늘"}`);
  return parts.length ? parts.join(" · ") : "거르기 없음";
}
