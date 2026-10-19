import { describe, expect, it } from "vitest";
import { OPEN_REGIONS } from "./constants";
import { canCancelRound, canDeleteSlot, roundCancelTargets, checkMaxTables, checkRoundEdit, checkSlotAdd, fromKstInput, toKstInput } from "./round-rules";

const now = new Date("2026-10-19T00:00:00Z"); // 10월 19일(월) 오전 9시
const FRI = "2026-10-23T10:30:00Z"; // 10월 23일(금) 저녁 7:30
const SAT = "2026-10-24T10:00:00Z";
const CUT = "2026-10-20T15:00:00.000Z"; // 10월 20일(화) 밤 12시
const before = { title: "10월 넷째 주 저녁", deadline: CUT, matchAt: CUT };
const edit = (after: Partial<typeof before>, extra: Partial<Parameters<typeof checkRoundEdit>[0]> = {}) =>
  checkRoundEdit({ status: "open", before, after: { ...before, ...after }, slotStarts: [FRI, SAT], now, ...extra });

describe("서울 시각 입력 칸 변환", () => {
  it("datetime-local 값과 ISO를 오간다", () => {
    expect(fromKstInput("2026-10-20T23:59")).toBe("2026-10-20T14:59:00.000Z");
    expect(toKstInput("2026-10-20T14:59:00.000Z")).toBe("2026-10-20T23:59");
    expect(fromKstInput("2026-10-20")).toBeNull();
  });
});

describe("회차 고치기 (마감 규칙)", () => {
  it("이름만 바꾸면 이전 값 → 새 값 한 줄", () => {
    const r = edit({ title: "10월 넷째 주 금토 저녁" });
    expect(r.errors).toEqual([]);
    expect(r.changes).toEqual([expect.objectContaining({ field: "title", from: "10월 넷째 주 저녁", to: "10월 넷째 주 금토 저녁" })]);
  });

  it("마감을 환불 마감(화요일 밤 12시) 뒤로 미루면 막는다", () => {
    const r = edit({ deadline: "2026-10-21T03:00:00Z", matchAt: "2026-10-21T03:00:00Z" });
    expect(r.errors.join()).toContain("환불 마감");
  });

  it("마감을 앞당기는 건 되지만 알려 준다", () => {
    const r = edit({ deadline: "2026-10-20T09:00:00Z" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain("앞당기면");
    expect(r.changes.map((c) => c.field)).toEqual(["apply_deadline"]);
    expect(r.changes[0].fromText).toBe("10월 20일(화) 밤 12시");
  });

  it("매칭은 마감과 같거나 뒤, 첫 모임 전이어야 한다", () => {
    expect(edit({ matchAt: "2026-10-20T10:00:00Z" }).errors.join()).toContain("신청 마감과 같거나 뒤");
    expect(edit({ matchAt: "2026-10-23T11:00:00Z" }).errors.join()).toContain("첫 모임");
  });

  it("매칭을 환불 마감 뒤로 미루는 건 되고, 첫 모임까지 하루 안 남으면 알려 준다", () => {
    expect(edit({ matchAt: "2026-10-21T00:00:00Z" })).toMatchObject({ errors: [], warnings: [] });
    expect(edit({ matchAt: "2026-10-23T00:00:00Z" }).warnings.join()).toContain("하루가 안");
  });

  it("마감을 지난 시각으로 옮기거나 바뀐 게 없으면 막는다", () => {
    expect(edit({ deadline: "2026-10-18T00:00:00Z" }).errors.join()).toContain("지금보다 뒤");
    expect(edit({}).errors).toEqual(["바뀐 내용이 없어요"]);
  });

  it("모집 중이 아니거나 매칭 시각이 지났으면 아예 못 고친다", () => {
    expect(edit({ title: "x" }, { status: "matched" }).errors).toEqual(["모집 중인 회차만 고칠 수 있어요"]);
    expect(edit({ title: "x" }, { now: new Date("2026-10-21T00:00:00Z") }).errors.join()).toContain("곧 매칭");
  });
});

describe("회차 취소", () => {
  it("모집 중이고 매칭 전일 때만", () => {
    const c = { status: "open", hasMatchRun: false, matchAt: CUT, now };
    expect(canCancelRound(c).ok).toBe(true);
    expect(canCancelRound({ ...c, status: "matching", hasMatchRun: true }).ok).toBe(false);
    expect(canCancelRound({ ...c, hasMatchRun: true }).ok).toBe(false);
    // 매칭 시각이 지났는데 아직 모집 중으로 남은 회차(스케줄러 직전)도 막는다
    expect(canCancelRound({ ...c, now: new Date("2026-10-21T00:00:00Z") }).ok).toBe(false);
  });
  it("취소하다 끊긴 회차는 남은 신청을 이어서 정리할 수 있다", () => {
    const c = { status: "closed", hasMatchRun: false, matchAt: CUT, now: new Date("2026-10-21T00:00:00Z") };
    expect(canCancelRound({ ...c, canceled: true })).toEqual({ ok: true, resume: true });
    // 그냥 끝난 회차는 안 된다
    expect(canCancelRound(c).ok).toBe(false);
  });
});

describe("일정 삭제 가능 여부", () => {
  it("신청자가 없고 다른 일정이 남을 때만", () => {
    expect(canDeleteSlot({ status: "open", applicants: 0, slotCount: 3 }).ok).toBe(true);
    const busy = canDeleteSlot({ status: "open", applicants: 2, slotCount: 3 });
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.reason).toContain("2명");
    expect(canDeleteSlot({ status: "open", applicants: 0, slotCount: 1 }).ok).toBe(false);
    expect(canDeleteSlot({ status: "closed", applicants: 0, slotCount: 3 }).ok).toBe(false);
  });
});

describe("일정 추가", () => {
  const base = { status: "open", region: "잠실·송파", maxTables: 4, openRegions: OPEN_REGIONS, existing: [{ startsAt: FRI, region: "홍대·합정·연남" }], deadline: CUT, matchAt: CUT, now };
  it("운영 중인 동네·다음 금요일이면 된다", () => {
    expect(checkSlotAdd({ ...base, startsAt: FRI })).toEqual([]);
  });
  it("서울 네 곳 밖, 겹치는 일정, 테이블 수 범위를 막는다", () => {
    expect(checkSlotAdd({ ...base, startsAt: FRI, region: "성수·뚝섬" }).join()).toContain("서울 네 동네");
    expect(checkSlotAdd({ ...base, startsAt: FRI, region: "홍대·합정·연남" }).join()).toContain("이미 있어요");
    expect(checkSlotAdd({ ...base, startsAt: FRI, maxTables: 0 }).join()).toContain("1~20");
  });
  it("환불 마감이 회차 마감보다 빠른 날짜(그 주 화요일 이전 마감)는 막는다", () => {
    // 10월 26일(월) 모임은 10월 20일(화) 밤 12시가 환불 마감 → 같으니 된다
    expect(checkSlotAdd({ ...base, startsAt: "2026-10-26T10:00:00Z" })).toEqual([]);
    // 회차 마감을 10월 27일(화) 밤 12시로 둔 회차에 10월 23일(금)을 더하면 환불 마감이 먼저 지나 버린다
    const late = { ...base, deadline: "2026-10-27T15:00:00Z", matchAt: "2026-10-27T15:00:00Z", startsAt: "2026-10-30T10:30:00Z" };
    expect(checkSlotAdd(late)).toEqual([]);
    expect(checkSlotAdd({ ...late, startsAt: FRI }).join()).toContain("자동 매칭 뒤");
    // 수요일 낮 마감 회차에 그 주 금요일을 더하면, 화요일 밤 12시에 환불이 먼저 닫힌다
    const wed = { ...base, deadline: "2026-10-21T03:00:00Z", matchAt: "2026-10-21T03:00:00Z" };
    expect(checkSlotAdd({ ...wed, startsAt: FRI }).join()).toContain("환불 마감(10월 20일(화) 밤 12시)");
  });
  it("지난 날짜는 막는다", () => {
    expect(checkSlotAdd({ ...base, startsAt: "2026-10-18T10:00:00Z" }).join()).toContain("지난 날짜");
  });
});

describe("일정별 최대 테이블 수", () => {
  it("1~20, 모집 중일 때만", () => {
    expect(checkMaxTables({ status: "open", maxTables: 6 })).toBeNull();
    expect(checkMaxTables({ status: "open", maxTables: 21 })).toContain("1~20");
    expect(checkMaxTables({ status: "matched", maxTables: 6 })).toContain("모집 중");
  });
});

describe("회차 취소 처리 대상", () => {
  const apps = [
    { id: "a", application_status: "SUBMITTED", payment_status: "PAID" },     // 살아 있는 신청
    { id: "b", application_status: "SUBMITTED", payment_status: "PENDING" },  // 결제 전
    { id: "c", application_status: "CANCELED", payment_status: "PAID" },      // 취소 뒤 환불 전에 끊김
    { id: "d", application_status: "CANCELED", payment_status: "REFUNDED" },  // 환불 끝
    { id: "e", application_status: "CANCELED", payment_status: "PENDING" },   // 결제 전 취소
  ];
  it("처음 취소할 때는 아직 취소되지 않은 신청만", () => {
    expect(roundCancelTargets(apps, false).map((x) => [x.id, x.needsCancel])).toEqual([["a", true], ["b", true]]);
  });
  it("이어서 정리할 때는 PAID로 남은 취소 신청도 돌려주기만 한다", () => {
    expect(roundCancelTargets(apps, true).map((x) => [x.id, x.needsCancel])).toEqual([["a", true], ["b", true], ["c", false]]);
  });
});
