import { describe, expect, it } from "vitest";
import { NOTICE } from "./labels";
import { MESSAGE_GROUPS, groupLabel, groupOf, groupTemplates } from "./message-groups";
import { TEMPLATES } from "./templates";

describe("자동 메시지 묶음", () => {
  it("키 이름으로 묶음을 정한다", () => {
    expect(groupOf("applied")).toBe("apply");
    expect(groupOf("paid_membership")).toBe("apply");
    expect(groupOf("payment_pending")).toBe("apply");
    expect(groupOf("alternative_remind")).toBe("match");
    expect(groupOf("reallocated")).toBe("match");
    expect(groupOf("reminder_chat")).toBe("meet");
    expect(groupOf("venue_changed")).toBe("meet");
    expect(groupOf("refund_retry")).toBe("refund");
    expect(groupOf("refunded")).toBe("refund");
    expect(groupOf("round_canceled")).toBe("refund");
    expect(groupOf("feedback_remind")).toBe("after");
    expect(groupOf("next_round")).toBe("after");
    expect(groupOf("announcement")).toBe("ops");
    expect(groupOf("pass_granted")).toBe("ops");
    expect(groupLabel("refund")).toBe("취소·환불");
  });

  it("모르는 키는 기타로 간다", () => {
    expect(groupOf("something_new")).toBe("etc");
    expect(groupOf("")).toBe("etc");
  });

  it("지금 있는 템플릿과 알림 종류는 모두 기타가 아닌 묶음에 들어간다", () => {
    const keys = [...Object.keys(TEMPLATES), ...Object.keys(NOTICE)];
    expect(keys.filter((k) => groupOf(k) === "etc")).toEqual([]);
  });

  it("묶음 순서대로 나누고, 빈 묶음은 빼고, 개수를 센다", () => {
    const g = groupTemplates(["refunded", "applied", "refund_failed", "paid"]);
    expect(g.map((x) => x.key)).toEqual(["apply", "refund"]);
    expect(g[0].keys).toEqual(["applied", "paid"]);
    expect(g[1].keys).toEqual(["refunded", "refund_failed"]);
    expect(g.every((x) => !x.open)).toBe(true);
  });

  it("실패가 있거나 최근에 고친 묶음은 펼쳐 둔다", () => {
    const g = groupTemplates(["applied", "refunded", "refund_failed", "reminder", "zzz"], { failed: { refund_failed: 2, refunded: 1 }, changed: ["reminder"] });
    const by = Object.fromEntries(g.map((x) => [x.key, x]));
    expect(by.refund).toMatchObject({ failed: 3, changed: 0, open: true });
    expect(by.meet).toMatchObject({ failed: 0, changed: 1, open: true });
    expect(by.apply.open).toBe(false);
    expect(by.etc.keys).toEqual(["zzz"]);
    expect(g.at(-1)!.key).toBe("etc");
  });

  it("전체 템플릿을 나눠도 빠지거나 겹치는 것이 없다", () => {
    const keys = Object.keys(TEMPLATES);
    const g = groupTemplates(keys);
    expect(g.flatMap((x) => x.keys).sort()).toEqual([...keys].sort());
    expect(g.length).toBeLessThanOrEqual(MESSAGE_GROUPS.length);
  });
});
