// 결제·환불 읽기 (화면·CSV 공통). 조건은 payment-filter.ts의 paymentQuery가 만들고, 여기서는 쿼리에 옮기기만 한다
import { escapeLike } from "./members";
import { type PaymentFilter, paymentQuery, paymentTotals } from "./payment-filter";
import { db } from "./supabase";

export const PAYMENT_COLS =
  "id,amount,status,provider,method,receipt_url,refund_error,pg_order_id,pass_type,paid_at,refunded_at,created_at,users(name),passes(remaining,total_count,expires_at),applications(id,match_status,attendance_status,application_status,rounds(title))";

export interface PaymentRow {
  id: string; amount: number; status: string; provider: string; method: string | null; receipt_url: string | null; refund_error: string | null; pg_order_id: string | null; pass_type: string | null; paid_at: string | null; refunded_at: string | null; created_at: string;
  users: { name: string }; passes: { remaining: number; total_count: number; expires_at: string | null } | null;
  applications: { id: string; match_status: string; attendance_status: string | null; application_status: string; rounds: { title: string } }[];
}

/** 이름은 회원에서, 회차는 그 회차 신청에 걸린 결제에서 id를 찾는다. 찾은 게 없으면 결과도 없다 */
async function idsFor(f: PaymentFilter): Promise<{ userIds?: string[]; paymentIds?: string[]; none: boolean }> {
  const out: { userIds?: string[]; paymentIds?: string[]; none: boolean } = { none: false };
  if (f.q) {
    const { data: us } = await db().from("users").select("id").ilike("name", `%${escapeLike(f.q)}%`).limit(200);
    out.userIds = (us ?? []).map((u) => u.id as string);
    if (!out.userIds.length) out.none = true;
  }
  if (f.r) {
    const { data: ap } = await db().from("applications").select("payment_id").eq("round_id", f.r).not("payment_id", "is", null);
    out.paymentIds = [...new Set((ap ?? []).map((a) => a.payment_id as string))];
    if (!out.paymentIds.length) out.none = true;
  }
  return out;
}

function build(cols: string, f: PaymentFilter, ids: { userIds?: string[]; paymentIds?: string[] }, count: boolean, limit?: number) {
  const pq = paymentQuery(f, limit);
  let q = db().from("payments").select(cols, count ? { count: "exact" } : undefined);
  if (ids.userIds) q = q.in("user_id", ids.userIds);
  if (ids.paymentIds) q = q.in("id", ids.paymentIds);
  if (pq.status) q = q.eq("status", pq.status);
  if (pq.providerEq) q = q.eq("provider", pq.providerEq);
  if (pq.providerNeq) q = q.neq("provider", pq.providerNeq);
  if (pq.passTypes) q = q.in("pass_type", pq.passTypes);
  if (pq.periodOr) q = q.or(pq.periodOr);
  return { q, pq };
}

/** 한 쪽 분량과 거른 조건에 맞는 전체 건수 */
export async function loadPayments(f: PaymentFilter, limit?: number): Promise<{ rows: PaymentRow[]; total: number }> {
  const ids = await idsFor(f);
  const { q, pq } = build(PAYMENT_COLS, f, ids, true, limit);
  if (ids.none || pq.none) return { rows: [], total: 0 };
  const { data, count } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(pq.offset, pq.offset + pq.limit - 1);
  return { rows: (data ?? []) as unknown as PaymentRow[], total: count ?? 0 };
}

/** CSV용: 거르기 그대로 최대 max건까지 1,000건씩 나눠 읽는다 */
export async function loadPaymentsAll(f: PaymentFilter, max = 5000): Promise<PaymentRow[]> {
  const out: PaymentRow[] = [];
  for (let page = 1; out.length < max; page++) {
    const { rows } = await loadPayments({ ...f, page }, 1000);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.slice(0, max);
}

/** 숫자 카드. 거른 조건이 있으면 그 조건 안에서, 없으면 전체에서 센다 (쪽 번호는 보지 않는다) */
export async function loadPaymentTotals(f: PaymentFilter) {
  const ids = await idsFor(f);
  const all: { amount: number; status: string; provider: string; users: { is_demo: boolean } | null }[] = [];
  if (!ids.none) {
    for (let page = 1; page <= 50; page++) {
      const { q, pq } = build("amount,status,provider,users(is_demo)", { ...f, page }, ids, false, 1000);
      if (pq.none) break;
      const { data } = await q.order("id").range(pq.offset, pq.offset + pq.limit - 1);
      const rows = (data ?? []) as unknown as (typeof all)[number][];
      all.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  // 시연 계정(테스트 참가자·봇)의 모의 결제는 매출과 섞이지 않게 따로 알려 준다
  return { ...paymentTotals(all), demoPaidSum: paymentTotals(all.filter((x) => x.users?.is_demo)).paidSum };
}
