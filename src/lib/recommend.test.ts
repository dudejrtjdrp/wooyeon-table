import { describe, expect, it } from "vitest";
import { membershipNudge, pickSlotFor, recommendBody, visitPrefs } from "./recommend";

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
    expect(recommendBody("10월 다섯째 주", pick, prefs, () => "10월 30일(금) 저녁 7:30")).toContain("자주 오신 금요일 홍대·합정·연남");
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
  });
});

