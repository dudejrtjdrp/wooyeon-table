import { beforeEach, describe, expect, it, vi } from "vitest";

// 메모리 DB: payments.ts 환불 재시도가 쓰는 쿼리만 흉내 낸다 (delivery.test.ts와 같은 방식)
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function q(name: string) {
  const rows = (tables[name] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let payload: Row | null = null;
  let opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  let sort: { k: string; asc: boolean } | null = null;
  let lim = Infinity;
  let one = false;
  const api = {
    select: () => api,
    insert: (r: Row) => ((op = "insert"), (payload = r), api),
    upsert: (r: Row, o: typeof opts) => ((op = "upsert"), (payload = r), (opts = o ?? {}), api),
    update: (r: Row) => ((op = "update"), (payload = r), api),
    delete: () => ((op = "delete"), api),
    like: (k: string, v: string) => (filters.push((r) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`).test(String(r[k] ?? ""))), api),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), api),
    not: (k: string, _op: "is", v: unknown) => (filters.push((r) => (r[k] ?? null) !== v), api),
    order: (k: string, o?: { ascending?: boolean }) => ((sort = { k, asc: o?.ascending ?? true }), api),
    limit: (n: number) => ((lim = n), api),
    maybeSingle: () => ((one = true), api),
    single: () => ((one = true), api),
    then(res: (v: unknown) => void) {
      res(run());
    },
  };
  function run() {
    if (op === "insert" || op === "upsert") {
      const key = opts.onConflict;
      if (key && rows.some((r) => r[key] === payload![key])) return { data: [], error: null };
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "delete") {
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { data: hit, error: null };
    }
    if (op === "update") {
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (sort) {
      const { k, asc } = sort;
      hit.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
    }
    const out = hit.slice(0, lim).map((r) => ({ ...r })); // 실제 DB처럼 읽은 값은 사본
    return { data: one ? (out[0] ?? null) : out, error: null };
  }
  return api;
}

const cancelToss = vi.fn();
const sent: { template: string; dedupeKey?: string }[] = [];
vi.mock("./supabase", () => ({ db: () => ({ from: q }) }));
vi.mock("./toss", () => ({ cancelToss: (...a: unknown[]) => cancelToss(...a) }));
// 시연용 가상 시각: 실제 시각보다 2주 뒤
const DEMO_NOW = new Date(Date.now() + 14 * 86400_000);
const REAL_NOW = "2026-10-20T12:00:00.000Z";
vi.mock("./clock", () => ({ now: async () => DEMO_NOW, realNowIso: () => REAL_NOW }));
vi.mock("./notify", () => ({ notify: async (n: { template: string; dedupeKey?: string }) => void sent.push(n) }));

const { markPaid, retryRefunds, REFUND_MAX_TRIES, REFUND_RETRY_GAP_MS } = await import("./payments");

const APP = "app-1";
const PAY = "pay-1";
const failures = () => (tables.status_events ?? []).filter((e) => e.to_value === "REFUND_FAILED").length;
/** 지금까지 남은 실패 기록을 10분 넘게 지난 것으로 돌린다 (재시도 간격을 기다린 셈) */
const waitGap = () => {
  for (const e of tables.status_events ?? []) e.created_at = new Date(Date.now() - REFUND_RETRY_GAP_MS - 60_000).toISOString();
};

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  sent.length = 0;
  cancelToss.mockReset();
  cancelToss.mockResolvedValue({ ok: false, error: { code: "PROVIDER_ERROR", message: "결제사 일시 오류" } });
  // 첫 환불이 한 번 실패해 REFUND_FAILED로 남은 신청 (실패 기록 1건)
  tables.applications = [{ id: APP, user_id: "u1", payment_id: PAY, payment_status: "REFUND_FAILED" }];
  tables.payments = [{ id: PAY, status: "REFUND_FAILED", amount: 9900, provider: "toss", pg_payment_key: "pk_1", pass_id: null }];
  tables.status_events = [{ id: "e0", entity_type: "application", entity_id: APP, field: "payment_status", to_value: "REFUND_FAILED", created_at: new Date().toISOString() }];
});

describe("환불 실패 자동 재시도 (D7)", () => {
  it("10분 안이면 건너뛴다 (결제사를 부르지 않는다)", async () => {
    expect(await retryRefunds()).toEqual({ retried: 0, done: 0 });
    expect(cancelToss).not.toHaveBeenCalled();
  });

  it("두 번째 실패까지는 예외 없이 다시 시도 예정으로 남는다", async () => {
    waitGap();
    expect(await retryRefunds()).toEqual({ retried: 1, done: 0 });
    expect(failures()).toBe(2);
    expect(tables.exceptions ?? []).toHaveLength(0);
    expect(tables.applications[0].payment_status).toBe("REFUND_FAILED");
    // '다시 시도 중' 알림은 보내지 않는다(참가자가 할 일이 없음)
    expect(sent.map((n) => n.template)).toEqual([]);
    // 방금 실패했으니 곧바로 다시 부르면 건너뛴다
    expect(await retryRefunds()).toEqual({ retried: 0, done: 0 });
  });

  it(`${REFUND_MAX_TRIES}번째 실패에서 운영자 예외 1건, 그 뒤로는 자동으로 다시 시도하지 않는다`, async () => {
    waitGap();
    await retryRefunds();
    waitGap();
    await retryRefunds();
    expect(failures()).toBe(REFUND_MAX_TRIES);
    expect(tables.exceptions).toHaveLength(1);
    expect(tables.exceptions[0]).toMatchObject({ kind: "refund", ref_type: "application", ref_id: APP, dedupe_key: `refund:${PAY}` });
    expect(sent.map((n) => n.template)).toContain("refund_failed");
    waitGap();
    expect(await retryRefunds()).toEqual({ retried: 0, done: 0 });
    expect(cancelToss).toHaveBeenCalledTimes(2);
    expect(tables.exceptions).toHaveLength(1);
  });

  it("다시 시도해서 되면 환불 완료로 바꾸고 완료 알림을 보낸다 (같은 멱등 키로 결제사 호출)", async () => {
    cancelToss.mockResolvedValue({ ok: true, data: { status: "CANCELED" } });
    waitGap();
    expect(await retryRefunds()).toEqual({ retried: 1, done: 1 });
    expect(tables.payments[0].status).toBe("REFUNDED");
    expect(tables.applications[0].payment_status).toBe("REFUNDED");
    expect(cancelToss.mock.calls[0][2]).toBe(`refund-${PAY}`);
    expect(sent.map((n) => n.template)).toEqual(["refunded"]);
  });
});

describe("결제 승인 시각은 시연용 시계로 (markPaid)", () => {
  it("paid_at·이용권 만료는 now() 기준이라 신청 시각보다 앞서지 않고, 예외 해결 시각은 실제 시각(감사 기록)", async () => {
    const submitted = new Date(DEMO_NOW.getTime() - 60_000).toISOString();
    tables.applications = [{ id: "a2", user_id: "u2", payment_id: "p2", payment_status: "PENDING", submitted_at: submitted, rounds: { title: "회차", match_at: new Date(DEMO_NOW.getTime() + 86400_000).toISOString() }, payments: { id: "p2", status: "PENDING", pass_type: "single", amount: 9900 } }];
    tables.payments = [{ id: "p2", status: "PENDING", amount: 9900, pass_type: "single" }];
    tables.exceptions = [{ id: "x1", status: "open", dedupe_key: "payment:p2:declined" }];
    expect(await markPaid("a2", "u2", { provider: "mock", reason: "모의 결제 승인" })).toBe(true);
    const pay = tables.payments[0];
    expect(pay.paid_at).toBe(DEMO_NOW.toISOString());
    expect(String(pay.paid_at) >= submitted).toBe(true);
    const pass = tables.passes[0];
    expect(new Date(String(pass.expires_at)).getTime() - DEMO_NOW.getTime()).toBe(60 * 86400_000);
    expect(tables.exceptions[0]).toMatchObject({ status: "resolved", resolved_at: REAL_NOW });
    // 두 번 눌러도 한 번만
    expect(await markPaid("a2", "u2", { provider: "mock", reason: "모의 결제 승인" })).toBe(false);
  });
});
