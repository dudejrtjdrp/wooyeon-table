import { describe, expect, it } from "vitest";
import { type AppState, type PendingRow, checkScheduledEdit, keyKind, planSync, remindAt, scheduledTarget, verdict } from "./scheduled-rules";

const A = "11111111-1111-1111-1111-111111111111";
const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const now = new Date("2026-10-20T00:00:00Z");
const starts = "2026-10-23T10:00:00Z";
const app = (o: Partial<AppState> = {}): AppState => ({
  id: A, user_id: "u1", application_status: "SUBMITTED", match_status: "CONFIRMED", attendance_status: "SCHEDULED", payment_status: "PAID", table_id: T1, resolution: null, ...o,
});
const table = (o: Partial<{ id: string; status: string; starts_at: string }> = {}) => ({ id: T1, status: "READY", starts_at: starts, ...o });
const remind = (o: Partial<PendingRow> = {}): PendingRow => ({ id: "n1", user_id: "u1", dedupe_key: `remind:${A}`, link: `/tables/${T1}`, scheduled_at: remindAt(starts).toISOString(), ...o });
const ok = { gone: false };

describe("keyKind", () => {
  it("키 앞부분으로 종류와 신청 id를 읽는다", () => {
    expect(keyKind(`remind:${A}:${T2}`)).toEqual({ kind: "remind", appId: A });
    expect(keyKind(`feedback-remind:${A}`)).toEqual({ kind: "feedback_remind", appId: A });
    expect(keyKind(`payment_pending:${A}:p1`)).toEqual({ kind: "payment_pending", appId: A });
    expect(keyKind(`alt_remind:${A}`)).toEqual({ kind: "alt_remind", appId: A });
    expect(keyKind("announcement:x")).toEqual({ kind: "other", appId: null });
    expect(keyKind(null).kind).toBe("other");
  });
});

describe("하루 전 안내", () => {
  it("확정·참석 예정·열린 테이블이면 그대로", () => {
    expect(verdict(remind(), app(), table(), ok, now)).toEqual({ action: "keep" });
  });
  it.each([
    ["참석 사전 취소", app({ attendance_status: "CANCELED_EARLY", table_id: null }), table()],
    ["당일 취소", app({ attendance_status: "CANCELED_LATE", table_id: null }), table()],
    ["테이블 해제(다른 방법 고르기)", app({ match_status: "ALTERNATIVE_OFFERED", attendance_status: null, table_id: null }), null],
    ["해제됐는데 결제 상태가 달라 신청이 남은 경우", app(), table({ status: "DISSOLVED" })],
    ["신청 취소(회차 취소)", app({ application_status: "CANCELED", match_status: "NO_MATCH" }), table()],
    ["노쇼", app({ attendance_status: "NO_SHOW" }), table()],
    ["모임 시작", app(), table({ status: "IN_PROGRESS" })],
  ])("%s이면 취소", (_, a, t) => {
    expect(verdict(remind(), a, t, ok, now).action).toBe("cancel");
  });
  it("탈퇴한 회원이면 무엇이든 취소", () => {
    expect(verdict(remind(), app(), table(), { gone: true }, now)).toEqual({ action: "cancel", why: "탈퇴한 회원이에요" });
  });
  it("다른 테이블로 옮기면 링크를, 모임 날짜가 바뀌면 보낼 시각을 맞춘다", () => {
    const later = "2026-10-25T10:00:00Z";
    const v = verdict(remind(), app({ table_id: T2 }), table({ id: T2, starts_at: later }), ok, now);
    expect(v).toEqual({ action: "update", patch: { link: `/tables/${T2}`, scheduled_at: remindAt(later).toISOString() } });
  });
  it("운영자가 고친 예약은 보낼 시각을 건드리지 않는다", () => {
    const later = "2026-10-25T10:00:00Z";
    expect(verdict(remind({ edited: true }), app(), table({ starts_at: later }), ok, now)).toEqual({ action: "keep" });
  });
  it("하루 안에 확정돼 보낼 시각이 이미 지났으면 시각은 그대로(곧 나간다)", () => {
    const soon = "2026-10-20T12:00:00Z";
    expect(verdict(remind({ scheduled_at: "2026-10-19T12:00:00Z" }), app(), table({ starts_at: soon }), ok, now)).toEqual({ action: "keep" });
  });
  it("다른 사람 신청에 걸린 키면 취소", () => {
    expect(verdict(remind({ user_id: "u2" }), app(), table(), ok, now).action).toBe("cancel");
  });
});

describe("다른 예약 종류", () => {
  const fb = (o: Partial<PendingRow> = {}): PendingRow => ({ id: "f", user_id: "u1", dedupe_key: `feedback-remind:${A}`, link: `/tables/${T1}/feedback`, scheduled_at: now.toISOString(), ...o });
  it("후기 다시 요청은 참석했고 후기가 없을 때만", () => {
    expect(verdict(fb(), app({ attendance_status: "ATTENDED" }), null, ok, now).action).toBe("keep");
    expect(verdict(fb(), app({ attendance_status: "ATTENDED", hasFeedback: true }), null, ok, now).action).toBe("cancel");
    expect(verdict(fb(), app({ attendance_status: "NO_SHOW" }), null, ok, now).action).toBe("cancel");
  });
  it("결제 안내는 결제 전 살아 있는 신청에만", () => {
    const p: PendingRow = { id: "p", user_id: "u1", dedupe_key: `payment_pending:${A}:x`, link: `/pay/${A}`, scheduled_at: now.toISOString() };
    const w = { match_status: "WAITING", attendance_status: null, table_id: null };
    expect(verdict(p, app({ ...w, payment_status: "PENDING" }), null, ok, now).action).toBe("keep");
    expect(verdict(p, app({ ...w, payment_status: "PAID" }), null, ok, now).action).toBe("cancel");
    expect(verdict(p, app({ ...w, payment_status: "REFUNDED" }), null, ok, now).action).toBe("cancel");
    expect(verdict(p, app({ ...w, payment_status: "PENDING", application_status: "CANCELED" }), null, ok, now).action).toBe("cancel");
  });
  it("다른 방법 고르기 알림은 고르기 전에만", () => {
    const r: PendingRow = { id: "r", user_id: "u1", dedupe_key: `alt_remind:${A}`, link: null, scheduled_at: now.toISOString() };
    const alt = { match_status: "ALTERNATIVE_OFFERED", attendance_status: null, table_id: null };
    expect(verdict(r, app(alt), null, ok, now).action).toBe("keep");
    expect(verdict(r, app({ ...alt, resolution: "wait" }), null, ok, now).action).toBe("cancel");
    expect(verdict(r, app({ match_status: "CONFIRMED" }), null, ok, now).action).toBe("cancel");
  });
});

describe("planSync", () => {
  it("같은 신청에 하루 전 안내가 두 건이면 하나만 남긴다", () => {
    const rows = [remind({ id: "old", dedupe_key: `remind:${A}` }), remind({ id: "new", dedupe_key: `remind:${A}:${T1}`, scheduled_at: new Date(remindAt(starts).getTime() + 1).toISOString() })];
    const p = planSync(rows, app(), table(), ok, now);
    expect(p.cancel.map((c) => c.id)).toEqual(["old"]);
    expect(p.needRemind).toBe(false);
  });
  it("빈자리로 들어와 하루 전 안내가 없으면 새로 건다", () => {
    expect(planSync([], app(), table(), ok, now).needRemind).toBe(true);
  });
  it("이미 하루 전 안내가 나갔으면 다시 걸지 않고 남은 것도 거둔다", () => {
    const p = planSync([remind()], app(), table(), ok, now, { remindSent: true });
    expect(p.needRemind).toBe(false);
    expect(p.cancel.map((c) => c.id)).toEqual(["n1"]);
  });
  it("확정이 아니면 새로 걸지 않는다", () => {
    expect(planSync([], app({ match_status: "ALTERNATIVE_OFFERED", table_id: null, attendance_status: null }), null, ok, now).needRemind).toBe(false);
    expect(planSync([], app(), table(), { gone: true }, now).needRemind).toBe(false);
  });
});

describe("checkScheduledEdit", () => {
  const base = { title: "내일 만나요", body: "7시 홍대", at: "2026-10-22T10:00:00Z", reason: "식당 사정 안내", now, startsAt: starts };
  it("정상 값", () => {
    expect(checkScheduledEdit(base).ok).toBe(true);
  });
  it.each([
    [{ title: " " }, "제목"],
    [{ body: "" }, "본문"],
    [{ at: null }, "시각"],
    [{ at: "2026-10-19T00:00:00Z" }, "지금보다 뒤"],
    [{ at: "2026-10-24T00:00:00Z" }, "모임 시작 전"],
    [{ reason: "짧" }, "사유"],
  ])("%o 이면 막는다", (o, msg) => {
    const r = checkScheduledEdit({ ...base, ...o });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(msg);
  });
});

describe("scheduledTarget", () => {
  it("하루 전 안내는 내 신청(일정 바꾸기·취소)으로", () => {
    expect(scheduledTarget({ dedupe_key: `remind:${A}:${T1}`, link: `/tables/${T1}` })).toEqual({ href: `/applications/${A}`, cta: "일정 바꾸기·취소" });
  });
  it("결제 안내는 결제 화면으로", () => {
    expect(scheduledTarget({ dedupe_key: `payment_pending:${A}:p`, link: `/pay/${A}` })?.href).toBe(`/pay/${A}`);
  });
});
