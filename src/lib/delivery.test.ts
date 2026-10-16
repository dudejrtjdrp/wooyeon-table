import { beforeEach, describe, expect, it, vi } from "vitest";

// 메모리 DB: delivery.ts가 쓰는 쿼리만 흉내 낸다
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const fail: Record<string, number> = {}; // 테이블별로 앞으로 몇 번 쓰기를 실패시킬지

const likeRe = (p: string) => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "s");

function q(name: string) {
  const rows = (tables[name] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "upsert" | "update" = "select";
  let payload: Row | null = null;
  let opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: string; head?: boolean } = {};
  let lim = Infinity;
  let one = false;
  const api = {
    select: (_c?: string, o?: typeof opts) => ((opts = { ...opts, ...o }), api),
    insert: (r: Row) => ((op = "insert"), (payload = r), api),
    upsert: (r: Row, o: typeof opts) => ((op = "upsert"), (payload = r), (opts = o), api),
    update: (r: Row) => ((op = "update"), (payload = r), api),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), api),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
    like: (k: string, p: string) => (filters.push((r) => typeof r[k] === "string" && likeRe(p).test(r[k] as string)), api),
    lt: (k: string, v: number) => (filters.push((r) => (r[k] as number) < v), api),
    gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), api),
    order: () => api,
    limit: (n: number) => ((lim = n), api),
    maybeSingle: () => ((one = true), api),
    single: () => ((one = true), api),
    then(res: (v: unknown) => void) {
      res(run());
    },
  };
  function run() {
    if (op !== "select" && (fail[name] ?? 0) > 0) {
      fail[name]--;
      return { data: null, error: { message: "일시 오류" } };
    }
    if (op === "insert" || op === "upsert") {
      const key = opts.onConflict;
      if (key && rows.some((r) => r[key] === payload![key])) return { data: [], error: null };
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (opts.head) return { data: null, count: hit.length, error: null };
    const out = hit.slice(0, lim);
    return { data: one ? (out[0] ?? null) : out, error: null };
  }
  return api;
}

vi.mock("./supabase", () => ({ db: () => ({ from: q }) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: () => null, sendNotification: vi.fn(), generateVAPIDKeys: () => ({ publicKey: "p", privateKey: "k" }) } }));

const { postSystem, retrySystemMessages, recordPushFailure, retryPushes, MAX_TRIES, RETRY_GAP_MIN } = await import("./delivery");

const ROOM = "11111111-1111-1111-1111-111111111111";
const later = (min: number) => Date.now() + min * 60_000;
const failures = () => tables.status_events.filter((e) => e.to_value === "FAILED").length;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(fail)) delete fail[k];
});

describe("단체방 시스템 메시지 재시도 (INF-08)", () => {
  it("한 번 실패해도 바로 한 번 더 해서 올라가면 실패 이력은 남지 않는다", async () => {
    fail.chat_messages = 1;
    expect(await postSystem(ROOM, "내일 7시에 만나요", { dedupeKey: "remind:t1" })).toBe(true);
    expect(tables.chat_messages).toHaveLength(1);
    expect(tables.status_events ?? []).toHaveLength(0);
  });

  it("계속 실패하면 이력에 남기고, 스케줄러가 10분 뒤 다시 올린다. 성공하면 SENT가 남는다", async () => {
    fail.chat_messages = 2;
    expect(await postSystem(ROOM, "내일 7시에 만나요", { dedupeKey: "remind:t2" })).toBe(false);
    expect(failures()).toBe(1);
    expect(await retrySystemMessages(later(1))).toBe(0); // 아직 10분이 안 됨
    expect(await retrySystemMessages(later(RETRY_GAP_MIN + 1))).toBe(1);
    expect(tables.chat_messages.map((m) => m.dedupe_key)).toEqual(["remind:t2"]);
    expect(tables.status_events.at(-1)?.to_value).toBe("SENT");
    expect(await retrySystemMessages(later(60))).toBe(0); // 이미 올라간 건 다시 안 올린다
    expect(tables.exceptions ?? []).toHaveLength(0);
  });

  it(`${MAX_TRIES}번 실패하면 그때만 예외 큐로 넘기고 더는 재시도하지 않는다`, async () => {
    fail.chat_messages = 100;
    await postSystem(ROOM, "모두 모이셨나요?", { dedupeKey: "content:t3" });
    await retrySystemMessages(later(11));
    expect(tables.exceptions ?? []).toHaveLength(0);
    // 같은 분에 실패가 두 번 쌓였으니 10분 더 기다린 뒤 세 번째
    for (const e of tables.status_events) e.created_at = new Date(Date.now() - 11 * 60_000).toISOString();
    await retrySystemMessages();
    expect(failures()).toBe(MAX_TRIES);
    expect(tables.exceptions).toHaveLength(1);
    expect(tables.exceptions[0]).toMatchObject({ kind: "notification", ref_type: "chat_room", dedupe_key: "chat:content:t3" });
    for (const e of tables.status_events) e.created_at = new Date(Date.now() - 11 * 60_000).toISOString();
    expect(await retrySystemMessages()).toBe(0);
  });
});

describe("푸시 재시도 (INF-08)", () => {
  it("실패 횟수와 사유를 알림에 남기고, 3번째 실패에서 예외 큐로", async () => {
    const n = { id: "n1", user_id: "u1", title: "테이블이 정해졌어요", attempts: 0, status: "sent", sent_at: new Date().toISOString(), last_error: null as string | null };
    tables.notifications = [n];
    await recordPushFailure(n, "503 Service Unavailable");
    expect(n).toMatchObject({ attempts: 1, last_error: "푸시 실패: 503 Service Unavailable" });
    await recordPushFailure(n, "503");
    expect(tables.exceptions ?? []).toHaveLength(0);
    await recordPushFailure(n, "503");
    expect(tables.exceptions).toHaveLength(1);
    expect(tables.exceptions[0]).toMatchObject({ kind: "notification", ref_type: "notification", ref_id: "n1" });
    expect(tables.status_events.filter((e) => e.field === "push")).toHaveLength(3);
  });

  it("재시도 대상은 실패 횟수만큼 10분씩 기다린 것만, 3번 채운 건 제외", async () => {
    const at = new Date().toISOString();
    tables.notifications = [
      { id: "a", status: "sent", last_error: "푸시 실패: x", attempts: 1, sent_at: at },
      { id: "b", status: "sent", last_error: "푸시 실패: x", attempts: 2, sent_at: at },
      { id: "c", status: "sent", last_error: "푸시 실패: x", attempts: 3, sent_at: at },
      { id: "d", status: "sent", last_error: null, attempts: 0, sent_at: at },
    ];
    expect(await retryPushes(later(5))).toBe(0);
    expect(await retryPushes(later(11))).toBe(1); // a만
    expect(await retryPushes(later(21))).toBe(2); // a, b (c는 이미 3번)
  });
});
