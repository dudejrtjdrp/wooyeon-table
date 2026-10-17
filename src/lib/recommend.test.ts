import { describe, expect, it } from "vitest";
import { membershipNudge, pickNext, pickSlotFor, recommendBody, visitPrefs } from "./recommend";

// 금요일: 10월 2·9·23·30일, 토요일: 10월 17·31일 (모두 저녁, 한국 시간)
const FRI = (d: number) => `2026-10-${String(d).padStart(2, "0")}T10:30:00Z`;
const SAT = (d: number) => `2026-10-${String(d).padStart(2, "0")}T10:00:00Z`;

describe("다음 일정 추천 (F9)", () => {
  it("마지막 한 번이 아니라 가장 많이 간 동네·요일을 고른다", () => {
    const prefs = visitPrefs([
      { region: "홍대·합정·연남", startsAt: FRI(2) },
      { region: "홍대·합정·연남", startsAt: FRI(9) },
      { region: "잠실·송파", startsAt: SAT(17) }, // 가장 최근
    ]);
    expect(prefs.regions[0].region).toBe("홍대·합정·연남");
    expect(prefs.day).toBe(5); // 금요일
    const slots = [{ region: "잠실·송파", starts_at: SAT(31) }, { region: "홍대·합정·연남", starts_at: SAT(31) }, { region: "홍대·합정·연남", starts_at: FRI(30) }];
    const pick = pickSlotFor(slots, prefs);
    expect(pick.kind).toBe("both");
    expect(pick.slot).toEqual({ region: "홍대·합정·연남", starts_at: FRI(30) });
    expect(recommendBody("10월 다섯째 주", pick, prefs, () => "10월 30일(금) 저녁 7:30")).toContain("늘 오시던 금요일 홍대·합정·연남");
  });

  it("식당 점수가 낮았던 동네는 많이 갔어도 순위가 내려간다", () => {
    const prefs = visitPrefs([
      { region: "강남·역삼·선릉", startsAt: FRI(2), venueScore: 2 },
      { region: "강남·역삼·선릉", startsAt: FRI(9), venueScore: 2 },
      { region: "을지로·종로·광화문", startsAt: SAT(17), venueScore: 5 },
    ]);
    expect(prefs.regions.map((r) => r.region)).toEqual(["을지로·종로·광화문", "강남·역삼·선릉"]);
    expect(prefs.regions[1].low).toBe(true);
    const pick = pickSlotFor([{ region: "강남·역삼·선릉", starts_at: FRI(30) }, { region: "을지로·종로·광화문", starts_at: FRI(30) }], prefs);
    expect(pick.slot?.region).toBe("을지로·종로·광화문");
  });

  it("맞는 동네가 없으면 요일만 맞춰 권하고, 그것도 없으면 일반 안내", () => {
    const prefs = visitPrefs([{ region: "홍대·합정·연남", startsAt: FRI(23) }]);
    expect(pickSlotFor([{ region: "잠실·송파", starts_at: FRI(30) }], prefs).kind).toBe("day");
    const none = pickSlotFor([{ region: "잠실·송파", starts_at: SAT(31) }], prefs);
    expect(none.kind).toBe("any");
    expect(recommendBody("11월 첫째 주", none, prefs, () => "")).toBe("11월 첫째 주 신청을 받아요");
  });
});

describe("두 번째 신청 멤버십 권유", () => {
  it("한 번이라도 결제한 사람에게만, 쓸 이용권이 없을 때만", () => {
    expect(membershipNudge(0, false, 9900, 35000)).toBeNull();
    expect(membershipNudge(1, true, 9900, 35000)).toBeNull();
    const n = membershipNudge(1, false, 9900, 35000);
    expect(n?.key).toBe("m1");
    expect(n?.note).toContain("39,600원");
    expect(n?.note).toContain("35,000원");
    expect(n?.note).toMatch(/^두 번째 신청이에요/);
    // 세 번째부터는 횟수를 말하지 않는다
    expect(membershipNudge(2, false, 9900, 35000)?.note).toMatch(/^다시 와 주셨네요/);
    expect(membershipNudge(3, false, 9900, 35000)?.note).toMatch(/^다시 와 주셨네요/);
  });
});

describe("홈·후기 직후 다음 일정 추천 (알림과 같은 기준)", () => {
  const round = (id: string, slots: { region: string; starts_at: string }[]) => ({ id, title: id, apply_deadline: "2026-11-10T15:00:00Z", slots });
  it("지난번에 간 동네·요일이 열려 있으면 그 일정", () => {
    const pick = pickNext([round("r1", [{ region: "강남·역삼·선릉", starts_at: FRI(30) }, { region: "을지로·종로·광화문", starts_at: FRI(30) }])], [{ region: "을지로·종로·광화문", startsAt: FRI(23), venueScore: 5 }]);
    expect(pick?.why).toBe("지난번처럼 금요일 을지로·종로·광화문, 이번에도 어때요?");
  });
  it("방금 식당을 낮게 준 동네는 '지난번처럼'으로 권하지 않는다", () => {
    const pick = pickNext([round("r1", [{ region: "을지로·종로·광화문", starts_at: FRI(30) }])], [{ region: "을지로·종로·광화문", startsAt: FRI(23), venueScore: 1 }]);
    expect(pick?.why).not.toMatch(/지난번처럼|을지로.*한 번 더/);
  });
  it("식당을 낮게 준 동네는 요일이 맞아도 고르지 않고, 다른 동네가 있으면 그쪽", () => {
    const v = [{ region: "을지로·종로·광화문", startsAt: FRI(23), venueScore: 1 }];
    const pick = pickNext([round("r1", [{ region: "을지로·종로·광화문", starts_at: FRI(30) }]), round("r2", [{ region: "잠실·송파", starts_at: FRI(30) }])], v);
    expect(pick?.roundId).toBe("r2");
    expect(pick?.why).toMatch(/잠실/);
  });
  it("'늘 오시던'은 그 동네·요일에 두 번 이상 갔을 때만, 다른 동네에 한 번씩이면 '지난번처럼'", () => {
    const slots = [{ region: "을지로·종로·광화문", starts_at: FRI(30) }];
    const twice = pickNext([round("r1", slots)], [{ region: "을지로·종로·광화문", startsAt: FRI(16) }, { region: "을지로·종로·광화문", startsAt: FRI(23) }]);
    expect(twice?.why).toBe("늘 오시던 금요일 을지로·종로·광화문, 이번에도 어때요?");
    const mixed = pickNext([round("r1", slots)], [{ region: "잠실·송파", startsAt: SAT(17) }, { region: "을지로·종로·광화문", startsAt: FRI(23) }]);
    expect(mixed?.why).toMatch(/^지난번처럼/);
  });
  it("모집 중인 일정이 없으면 null, 이력이 없으면 가장 가까운 회차", () => {
    expect(pickNext([], [])).toBeNull();
    expect(pickNext([round("r1", [{ region: "잠실·송파", starts_at: FRI(30) }])], [])?.roundId).toBe("r1");
  });
});

