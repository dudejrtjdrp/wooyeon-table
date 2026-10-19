import { describe, expect, it } from "vitest";
import { attendanceChange, attendanceOps, canRunMatchNow, canSwapVenue, runResultText, swapCandidates, type SwapOption } from "./admin-manual-rules";

const start = "2026-11-06T10:00:00.000Z"; // 19:00 KST
const at = (iso: string) => new Date(iso);

describe("식당 바꾸기 가능 여부", () => {
  const base = { status: "READY", hasVenue: true, startsAt: start, now: at("2026-11-05T10:00:00Z") };
  it("모임 전 확정 테이블은 바꿀 수 있다", () => {
    expect(canSwapVenue(base).ok).toBe(true);
    expect(canSwapVenue({ ...base, status: "CONFIRMED" }).ok).toBe(true);
  });
  it("모임이 시작되면 막는다 (상태가 아직 안 바뀌었어도 시각으로)", () => {
    expect(canSwapVenue({ ...base, now: at(start) })).toMatchObject({ ok: false, reason: expect.stringContaining("시작") });
    expect(canSwapVenue({ ...base, status: "IN_PROGRESS" })).toMatchObject({ ok: false });
  });
  it("끝났거나 해제된 테이블, 식당이 없는 테이블은 막는다", () => {
    expect(canSwapVenue({ ...base, status: "DONE" }).ok).toBe(false);
    expect(canSwapVenue({ ...base, status: "DISSOLVED" }).ok).toBe(false);
    expect(canSwapVenue({ ...base, hasVenue: false })).toMatchObject({ ok: false, reason: expect.stringContaining("예외 처리함") });
  });
});

describe("바꿀 식당 후보", () => {
  const v = (id: string, o: Partial<SwapOption> = {}): SwapOption => ({ venueId: id, name: id, region: "홍대", active: true, rating: 4.5, channel: "naver", seats: 6, tablesAvailable: 1, ...o });
  const need = { region: "홍대", party: 5, used: new Map<string, number>(), currentVenueId: "cur" };

  it("지금 식당·다른 동네·꺼진 식당은 빼고 평점 순", () => {
    const list = swapCandidates([v("cur"), v("a", { rating: 4.1 }), v("b", { rating: 4.8 }), v("far", { region: "잠실" }), v("off", { active: false })], need);
    expect(list.map((x) => x.venueId)).toEqual(["b", "a"]);
  });
  it("이미 쓴 테이블을 빼고 재고가 남은 곳만", () => {
    const list = swapCandidates([v("a", { tablesAvailable: 2 }), v("b", { tablesAvailable: 1 })], { ...need, used: new Map([["a", 1], ["b", 1]]) });
    expect(list.map((x) => [x.venueId, x.left])).toEqual([["a", 1]]);
  });
  it("인원이 좌석보다 많으면 뺀다", () => {
    expect(swapCandidates([v("small", { seats: 4 })], need)).toEqual([]);
  });
  it("평점이 같으면 남은 자리가 많은 곳, 그다음 이름 순. 예약 실패했던 곳은 표시만", () => {
    const list = swapCandidates([v("나", { tablesAvailable: 1 }), v("가", { tablesAvailable: 1 }), v("다", { tablesAvailable: 3 })], { ...need, failed: new Set(["가"]) });
    expect(list.map((x) => x.venueId)).toEqual(["다", "가", "나"]);
    expect(list.find((x) => x.venueId === "가")!.failedBefore).toBe(true);
  });
});

describe("참석 상태 바꾸기", () => {
  // 모임 10:00~12:30(UTC), 끝난 뒤 13:00, 노쇼 후보로 올라온 사람
  const o = { status: "SCHEDULED", tableStatus: "DONE", startsAt: start, endsAt: "2026-11-06T12:30:00Z", now: at("2026-11-06T13:00:00Z"), isCandidate: true };
  it("체크인은 1시간 전부터, 끝난 뒤에도 정정할 수 있다", () => {
    expect(attendanceChange("checkin", { ...o, now: at("2026-11-06T08:59:00Z") })).toMatchObject({ ok: false, reason: expect.stringContaining("1시간 전") });
    expect(attendanceChange("checkin", { ...o, now: at("2026-11-06T09:00:00Z") })).toEqual({ ok: true, from: "SCHEDULED", to: "ATTENDED" });
    expect(attendanceChange("checkin", { ...o, tableStatus: "DONE", now: at("2026-11-08T10:00:00Z") }).ok).toBe(true);
  });
  it("노쇼는 모임이 끝난 뒤, 노쇼 후보만 (늦게 오는 사람을 모임 도중 노쇼로 만들지 않는다)", () => {
    expect(attendanceChange("noshow", { ...o, now: at("2026-11-06T09:59:00Z") })).toMatchObject({ ok: false, reason: expect.stringContaining("끝난 뒤") });
    expect(attendanceChange("noshow", { ...o, tableStatus: "IN_PROGRESS", now: at("2026-11-06T10:30:00Z") })).toMatchObject({ ok: false, reason: expect.stringContaining("늦게 오는") });
    expect(attendanceChange("noshow", { ...o, isCandidate: false })).toMatchObject({ ok: false, reason: expect.stringContaining("후보") });
    expect(attendanceChange("noshow", o)).toEqual({ ok: true, from: "SCHEDULED", to: "NO_SHOW" });
  });
  it("이미 처리된 사람은 같은 처리를 다시 못 하고, 반대 처리는 되돌린 뒤에만", () => {
    expect(attendanceChange("noshow", { ...o, status: "NO_SHOW" }).ok).toBe(false);
    expect(attendanceChange("checkin", { ...o, status: "NO_SHOW" })).toMatchObject({ ok: false, reason: expect.stringContaining("되돌려") });
    expect(attendanceChange("noshow", { ...o, status: "ATTENDED" })).toMatchObject({ ok: false, reason: expect.stringContaining("되돌려") });
  });
  it("되돌리기: 체크인·노쇼만, 후기를 남긴 참석은 막는다", () => {
    expect(attendanceChange("revert", { ...o, status: "NO_SHOW" })).toEqual({ ok: true, from: "NO_SHOW", to: "SCHEDULED" });
    expect(attendanceChange("revert", { ...o, status: "ATTENDED" }).ok).toBe(true);
    expect(attendanceChange("revert", { ...o, status: "ATTENDED", hasFeedback: true }).ok).toBe(false);
    expect(attendanceChange("revert", o).ok).toBe(false);
    expect(attendanceChange("revert", { ...o, status: "CANCELED_EARLY" }).ok).toBe(false);
  });
  it("해제된 테이블은 아무것도 못 한다", () => {
    expect(attendanceOps({ ...o, tableStatus: "DISSOLVED" })).toEqual([]);
  });
  it("줄마다 보여 줄 버튼", () => {
    expect(attendanceOps({ ...o, now: at("2026-11-05T10:00:00Z") })).toEqual([]);
    expect(attendanceOps({ ...o, now: at("2026-11-06T09:30:00Z") })).toEqual(["checkin"]);
    expect(attendanceOps(o)).toEqual(["checkin", "noshow"]);
    expect(attendanceOps({ ...o, status: "ATTENDED" })).toEqual(["revert"]);
  });
});

describe("자동 매칭 지금 돌리기", () => {
  const r = { status: "open", hasRun: false, applyDeadline: "2026-11-03T15:00:00Z", matchAt: "2026-11-03T15:00:00Z", now: at("2026-11-04T00:00:00Z"), paid: 12, unpaid: 0 };
  it("닫힌 회차·이미 돈 회차는 막는다", () => {
    expect(canRunMatchNow({ ...r, status: "closed" })).toMatchObject({ ok: false, reason: expect.stringContaining("닫힌") });
    expect(canRunMatchNow({ ...r, hasRun: true })).toMatchObject({ ok: false, reason: expect.stringContaining("이미") });
    expect(canRunMatchNow({ ...r, status: "matched" }).ok).toBe(false);
    expect(canRunMatchNow({ ...r, status: "matching" }).ok).toBe(false);
  });
  it("결제 완료자가 없으면 막는다", () => {
    expect(canRunMatchNow({ ...r, paid: 0, unpaid: 3 }).ok).toBe(false);
  });
  it("마감 뒤면 그냥 확인만", () => {
    const x = canRunMatchNow(r);
    expect(x.ok && x.early).toBe(false);
    expect(x.ok && x.confirm).toContain("12명");
    expect(x.ok && x.confirm).not.toContain("마감 전");
  });
  it("신청 마감 전이면 마감 전 신청자만 들어간다고 먼저 알린다. 결제 대기자도 알린다", () => {
    const x = canRunMatchNow({ ...r, now: at("2026-11-02T00:00:00Z"), unpaid: 2 });
    expect(x.ok && x.early).toBe(true);
    expect(x.ok && x.confirm).toContain("아직 신청 마감 전이에요");
    expect(x.ok && x.confirm).toContain("2명은 빠져요");
  });
  it("결과 문구", () => {
    expect(runResultText({ alreadyRan: false, tables: 3, confirmed: 15, failed: 2, exceptions: 1 })).toBe("매칭을 돌렸어요. 테이블 3개, 15명 확정. 테이블에 못 든 2명에게는 다른 일정·보관·환불을 안내했어요. 정보가 모자란 1명은 예외 처리함에 올렸어요");
    expect(runResultText({ alreadyRan: true, tables: 0, confirmed: 0, failed: 0, exceptions: 0 })).toContain("다시 돌리지 않았어요");
  });
});
