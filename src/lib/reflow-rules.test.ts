import { describe, expect, it } from "vitest";
import { scoreGroup } from "./matching/score";
import { reallocTier } from "./matching/tiers";
import { DEFAULT_SETTINGS, type Relations, pairKey } from "./matching/types";
import { type ReflowMember, type ReflowTarget, planReflow, toCandidate } from "./reflow-rules";

const at = new Date("2026-10-20T00:00:00Z");
const FRI = "2026-10-23T10:30:00Z";
const SAT = "2026-10-24T10:00:00Z";
const HONGDAE = "홍대·합정·연남";
const JAMSIL = "잠실·송파";
const GANGNAM = "강남·역삼·선릉";
const source = { region: HONGDAE, startsAt: FRI };
const m = (id: string, birthYear: number, slotIds: string[]): ReflowMember => ({ id, userId: `u-${id}`, birthYear, slotIds });
const group = (prefix: string, n: number, birthYear = 1996, slot = "fri-hongdae") => Array.from({ length: n }, (_, i) => m(`${prefix}${i}`, birthYear, [slot]));
const rel = (): Relations => ({ excluded: new Set(), met: new Set(), again: new Set() });

describe("확정 후 3명 남은 테이블 재배치 (Q10)", () => {
  it("4명 이상 남았으면 아무것도 안 한다", () => {
    expect(planReflow(group("a", 4), [], rel(), DEFAULT_SETTINGS, source, at)).toEqual([]);
  });

  it("본인이 고른 일정 안에서만 옮기고, 나이 차·제외 관계·정원 조건은 낮추지 않는다", () => {
    const left = [m("me", 1996, ["fri-hongdae"]), m("old", 1985, ["fri-hongdae"]), m("both", 1996, ["fri-hongdae", "sat-jamsil"])];
    const targets: ReflowTarget[] = [
      { id: "t-other-day", slotId: "sat-jamsil", startsAt: SAT, region: JAMSIL, members: group("s", 4, 1996, "sat-jamsil") }, // 'me'는 안 고른 일정
      { id: "t-full", slotId: "fri-hongdae", startsAt: FRI, region: HONGDAE, members: group("f", 6) }, // 정원
      { id: "t-ok", slotId: "fri-hongdae", startsAt: FRI, region: HONGDAE, members: group("k", 4) },
    ];
    const r = rel();
    r.excluded.add(pairKey("u-both", "u-k0")); // both는 t-ok의 한 사람과 같이 못 앉음
    const plan = planReflow(left, targets, r, DEFAULT_SETTINGS, source, at);
    expect(plan).toEqual([
      { appId: "me", targetId: "t-ok" },
      { appId: "old", targetId: null }, // 1985년생은 1996년생 테이블과 나이 차 11살 → 옮기지 않음
      { appId: "both", targetId: "t-other-day" }, // 같이 못 앉는 사람이 있어 자기가 고른 다른 일정으로
    ]);
  });

  it("옮길 곳이 없으면 모두 null → ALTERNATIVE_OFFERED(참가자가 다른 일정·보관·환불을 고름)", () => {
    const left = group("a", 3);
    const soon: ReflowTarget = { id: "t-soon", slotId: "fri-hongdae", startsAt: "2026-10-20T20:00:00Z", region: HONGDAE, members: group("k", 4) }; // 24시간 안
    expect(planReflow(left, [soon], rel(), DEFAULT_SETTINGS, source, at).every((x) => x.targetId === null)).toBe(true);
  });

  it("옮긴 사람도 정원에 넣어 센다(한 테이블에 7명 이상 안 됨)", () => {
    const left = group("a", 3);
    const t: ReflowTarget = { id: "t5", slotId: "fri-hongdae", startsAt: FRI, region: HONGDAE, members: group("k", 5) };
    const plan = planReflow(left, [t], rel(), DEFAULT_SETTINGS, source, at);
    expect(plan.filter((x) => x.targetId === "t5")).toHaveLength(1);
  });
});

describe("재배치 뒤 최소 점수 재검사 (M9)", () => {
  it("옮긴 뒤 테이블 점수(gate)가 최소 점수보다 낮으면 옮기지 않는다", () => {
    const mover = { ...m("x", 1996, ["fri-hongdae"]), gender: "F" as const, mbti: "ISTJ", interests: ["게임"], wantedTraits: ["조용한"] };
    const target: ReflowTarget = { id: "t", slotId: "fri-hongdae", startsAt: FRI, region: HONGDAE, members: group("k", 4).map((k) => ({ ...k, gender: "M" as const, mbti: "ENFP", interests: ["여행"], myTraits: ["활발한"], wantedTraits: ["활발한"] })) };
    const after = scoreGroup([...target.members, mover].map(toCandidate), rel(), DEFAULT_SETTINGS);
    // 필수 조건(나이·제외·정원)은 모두 통과하는 조합이다
    expect(after.ageGap).toBe(0);
    // 같은 조합이 최소 점수를 넘으면 옮기고, 운영자가 기준을 올려 못 넘으면 옮기지 않는다
    expect(planReflow([mover], [target], rel(), { ...DEFAULT_SETTINGS, minScore: after.gate }, source, at)).toEqual([{ appId: "x", targetId: "t" }]);
    expect(planReflow([mover], [target], rel(), { ...DEFAULT_SETTINGS, minScore: after.gate + 0.1 }, source, at)).toEqual([{ appId: "x", targetId: null }]);
  });
});

describe("재배치 순서는 PRD 7.4와 엔진(reallocTier)과 같다 (M6)", () => {
  it("순위 계산: 같은 날·같은 지역 1 → 같은 날·다른 지역 2 → 다른 날·같은 지역 3 → 다른 날·다른 지역 4", () => {
    expect(reallocTier(source, { region: HONGDAE, startsAt: FRI }).tier).toBe(1);
    expect(reallocTier(source, { region: GANGNAM, startsAt: FRI }).tier).toBe(2);
    expect(reallocTier(source, { region: HONGDAE, startsAt: SAT }).tier).toBe(3);
    expect(reallocTier(source, { region: JAMSIL, startsAt: SAT }).tier).toBe(4);
  });

  it("고를 수 있는 테이블이 여럿이면 7.4 순서대로 고른다 (이른 날짜보다 순위가 먼저)", () => {
    const slots = ["thu-jamsil", "sat-hongdae", "fri-gangnam", "fri-hongdae"];
    const t = (id: string, slotId: string, startsAt: string, region: string): ReflowTarget => ({ id, slotId, startsAt, region, members: group(id, 4, 1996, slotId) });
    // 4순위(다른 날·다른 지역) 테이블이 가장 이른 모임이어도 1순위가 먼저다
    const all = [t("t4", "thu-jamsil", "2026-10-22T10:30:00Z", JAMSIL), t("t3", "sat-hongdae", SAT, HONGDAE), t("t2", "fri-gangnam", FRI, GANGNAM), t("t1", "fri-hongdae", FRI, HONGDAE)];
    const pick = (targets: ReflowTarget[]) => planReflow([m("me", 1996, slots)], targets, rel(), DEFAULT_SETTINGS, source, at)[0].targetId;
    expect(pick(all)).toBe("t1");
    expect(pick(all.filter((x) => x.id !== "t1"))).toBe("t2");
    expect(pick(all.filter((x) => !["t1", "t2"].includes(x.id)))).toBe("t3");
    expect(pick(all.filter((x) => x.id === "t4"))).toBe("t4");
  });
});
