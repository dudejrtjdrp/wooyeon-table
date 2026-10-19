import { describe, expect, it } from "vitest";
import { canReopen, exceptionsHref, openRank, parseExceptionView, reopenConfirm, sortOpenFirst, viewStatus } from "./exception-view";

describe("예외 처리함 보기", () => {
  it("v=done|all, 예전 주소 all=1 은 모두, 나머지는 처리할 것", () => {
    expect(parseExceptionView({})).toBe("open");
    expect(parseExceptionView({ v: "done" })).toBe("done");
    expect(parseExceptionView({ v: "all" })).toBe("all");
    expect(parseExceptionView({ all: "1" })).toBe("all");
    expect(parseExceptionView({ v: "x" })).toBe("open");
  });
  it("주소와 DB 상태", () => {
    expect(exceptionsHref({})).toBe("/admin/exceptions");
    expect(exceptionsHref({ v: "done", k: "refund" })).toBe("/admin/exceptions?v=done&k=refund");
    expect(exceptionsHref({ v: "open", k: "safety" })).toBe("/admin/exceptions?k=safety");
    expect(viewStatus("open")).toBe("open");
    expect(viewStatus("done")).toBe("resolved");
    expect(viewStatus("all")).toBeNull();
  });
});

describe("다시 열기", () => {
  it("처리한 건만, 사유를 4자 이상 적어야 연다", () => {
    expect(canReopen({ status: "open", note: "다시 볼게요" })).toEqual({ ok: false, reason: "이미 열려 있는 예외예요" });
    expect(canReopen({ status: "resolved", note: "  " }).ok).toBe(false);
    expect(canReopen({ status: "resolved", note: "잘못" }).ok).toBe(false);
    expect(canReopen({ status: "resolved", note: "  환불이  실제로 안 됨 " })).toEqual({ ok: true, note: "환불이 실제로 안 됨" });
  });
  it("확인 문구에 바뀐 데이터는 되돌리지 않는다고 적는다", () => {
    expect(reopenConfirm("노쇼 확정")).toContain("(노쇼 확정)은 되돌리지 않아요");
    expect(reopenConfirm(null)).toContain("되돌리지 않아요");
  });
  it("다시 연 건이 열린 목록 맨 위, 그다음 본인 참석 알림, 나머지는 원래 순서", () => {
    const rows = [
      { id: "a", status: "open", re: false, claimed: false },
      { id: "b", status: "open", re: false, claimed: true },
      { id: "c", status: "open", re: true, claimed: false },
      { id: "d", status: "resolved", re: true, claimed: false },
      { id: "e", status: "open", re: false, claimed: false },
    ];
    expect(sortOpenFirst(rows, (e) => openRank(e, e.re, e.claimed)).map((e) => e.id)).toEqual(["c", "b", "a", "d", "e"]);
  });
});
