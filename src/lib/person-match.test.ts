import { describe, expect, it } from "vitest";
import { personMatchIds, personMatchView } from "./person-match";

const me = "me";
const t = (d: number) => `2026-10-${String(d).padStart(2, "0")}T10:00:00Z`;

describe("personMatchView", () => {
  it("내가 남긴 '다시는 싫어요'·차단·신고는 피하고 싶은 사람으로 묶여 반드시 떨어뜨림", () => {
    const v = personMatchView(me, {
      prefs: [{ from_user: me, to_user: "a", pref: "avoid", table_id: "t1", created_at: t(1) }],
      blocks: [{ blocker_id: me, blocked_id: "a", created_at: t(3) }],
      reports: [{ reporter_id: me, reported_id: "b", created_at: t(2) }],
    });
    expect(v.avoidByMe.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(v.avoidByMe[0].rule).toBe("hard");
    expect(v.avoidByMe[0].reasons.map((x) => x.source)).toEqual(["block", "avoid"]);
    expect(v.avoidMe).toEqual([]);
  });

  it("상대가 남긴 것은 나를 피하고 싶은 사람으로", () => {
    const v = personMatchView(me, {
      prefs: [{ from_user: "c", to_user: me, pref: "avoid", table_id: "t1", created_at: t(1) }],
      blocks: [{ blocker_id: "d", blocked_id: me, created_at: t(2) }],
      reports: [{ reporter_id: "e", reported_id: me, created_at: t(3) }],
    });
    expect(v.avoidMe.map((r) => [r.userId, r.reasons[0].source])).toEqual([["e", "report"], ["d", "block"], ["c", "avoid"]]);
    expect(v.avoidByMe).toEqual([]);
  });

  it("또 만나고 싶어요는 점수에만, 누가 골랐는지 남긴다", () => {
    const v = personMatchView(me, {
      prefs: [
        { from_user: me, to_user: "a", pref: "again", table_id: "t1", created_at: t(1) },
        { from_user: "a", to_user: me, pref: "again", table_id: "t1", created_at: t(1) },
        { from_user: "b", to_user: me, pref: "again", table_id: "t1", created_at: t(2) },
      ],
      blocks: [],
      reports: [],
    });
    expect(v.again.map((r) => [r.userId, r.rule, r.note])).toEqual([
      ["b", "score", "상대가 골랐어요"],
      ["a", "score", "서로 골랐어요"],
    ]);
  });

  it("피하는 관계가 있으면 또 만나고 싶어요는 반영 안 함, 시연 봇이 고른 것도", () => {
    const v = personMatchView(me, {
      prefs: [
        { from_user: me, to_user: "a", pref: "again", table_id: "t1", created_at: t(1) },
        { from_user: "bot", to_user: me, pref: "again", table_id: "t1", created_at: t(1) },
      ],
      blocks: [{ blocker_id: "a", blocked_id: me, created_at: t(2) }],
      reports: [],
      bots: new Set(["bot"]),
    });
    const by = new Map(v.again.map((r) => [r.userId, r]));
    expect(by.get("a")?.rule).toBe("off");
    expect(by.get("a")?.note).toContain("떨어뜨리는 쪽이 우선");
    expect(by.get("bot")?.rule).toBe("off");
    expect(by.get("bot")?.note).toContain("시연 봇");
  });

  it("같이 앉은 사람은 되도록 떨어뜨림, 피하는 사람은 빼고, 후기 낮음 표시", () => {
    const v = personMatchView(me, {
      prefs: [{ from_user: me, to_user: "x", pref: "avoid", table_id: "t1", created_at: t(1) }],
      blocks: [],
      reports: [],
      met: [
        { userId: "x", at: t(1), tableId: "t1" },
        { userId: "y", at: t(1), tableId: "t1", low: true },
        { userId: me, at: t(1) },
      ],
    });
    expect(v.met.map((r) => r.userId)).toEqual(["y"]);
    expect(v.met[0].rule).toBe("soft");
    expect(v.met[0].reasons.map((x) => x.source).sort()).toEqual(["low", "met"]);
    expect(personMatchIds(v).sort()).toEqual(["x", "y"]);
  });
});
