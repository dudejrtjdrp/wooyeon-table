import { describe, expect, it } from "vitest";
import { personRelations, relationIds, reopenCheck, reopenReason, reportStatusText } from "./safety-rules";

describe("신고 다시 열기", () => {
  it("닫은 신고만 다시 연다", () => {
    expect(reopenCheck({ status: "reviewed" })).toEqual({ ok: true });
    expect(reopenCheck({ status: "open" }).ok).toBe(false);
    expect(reopenCheck(null).ok).toBe(false);
  });

  it("이력에 이전 결정과 사유를 함께 남긴다", () => {
    expect(reopenReason({ action: "none", admin_note: "증거 없음" }, "추가 신고가 들어옴")).toBe("신고 다시 열기 (이전 결정: 조치 없음, 메모: 증거 없음): 추가 신고가 들어옴");
    expect(reopenReason({ action: "warning", admin_note: null }, "다시 볼게요")).toBe("신고 다시 열기 (이전 결정: 경고): 다시 볼게요");
    expect(reportStatusText({ status: "open", action: null })).toBe("검토 전");
    expect(reportStatusText({ status: "reviewed", action: "banned" })).toBe("영구 제한");
  });
});

describe("사람별 비선호·차단", () => {
  const prefs = [
    { from_user: "me", to_user: "x", pref: "avoid", created_at: "2026-10-01T00:00:00Z" },
    { from_user: "me", to_user: "x", pref: "avoid", created_at: "2026-10-08T00:00:00Z" },
    { from_user: "me", to_user: "y", pref: "again", created_at: "2026-10-08T00:00:00Z" },
    { from_user: "z", to_user: "me", pref: "avoid", created_at: "2026-10-09T00:00:00Z" },
    { from_user: "w", to_user: "me", pref: "again", created_at: "2026-10-09T00:00:00Z" },
    { from_user: "q", to_user: "r", pref: "avoid", created_at: "2026-10-09T00:00:00Z" },
  ];
  const blocks = [
    { blocker_id: "me", blocked_id: "x", created_at: "2026-10-08T00:00:00Z" },
    { blocker_id: "k", blocked_id: "me", created_at: "2026-10-10T00:00:00Z" },
  ];

  it("남긴 것과 받은 것을 나누고, 같은 상대는 한 줄로 묶어 횟수를 센다", () => {
    const r = personRelations("me", prefs, blocks);
    expect(r.gaveAvoid).toEqual([{ userId: "x", times: 2, last: "2026-10-08T00:00:00Z" }]);
    expect(r.gotAvoid).toEqual([{ userId: "z", times: 1, last: "2026-10-09T00:00:00Z" }]);
    expect(r.gaveBlock.map((x) => x.userId)).toEqual(["x"]);
    expect(r.gotBlock.map((x) => x.userId)).toEqual(["k"]);
    expect([r.gaveAgain, r.gotAgain]).toEqual([1, 1]);
    expect(relationIds(r).sort()).toEqual(["k", "x", "z"]);
  });

  it("관계가 없으면 빈 목록", () => {
    const r = personRelations("none", prefs, blocks);
    expect(relationIds(r)).toEqual([]);
  });
});
