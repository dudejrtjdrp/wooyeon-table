import { describe, expect, it } from "vitest";
import { runMatching } from "./engine";
import { feedbackSignals, trustOf } from "./feedback";
import { reasonsFor, scoreGroup } from "./score";
import { type Candidate, DEFAULT_SETTINGS, type Relations, type Slot, pairKey } from "./types";

const slot: Slot = { id: "fri-hongdae", region: "홍대·합정·연남", startsAt: "2026-10-23T10:30:00Z", maxTables: 2 };
const MBTI = ["ENFP", "INFP", "ENFP", "INFP", "ENFP", "INFP", "ENFP", "INFP"];
const people: Candidate[] = Array.from({ length: 8 }, (_, i) => ({
  applicationId: `a${i}`, userId: `u${i}`, birthYear: 1995, gender: i % 2 ? "F" : "M", mbti: MBTI[i],
  interests: ["맛집 탐방", "여행", "책"], myTraits: ["다정한"], wantedTraits: ["다정한"], slotIds: [slot.id],
}));
const empty = (): Relations => ({ excluded: new Set(), met: new Set(), again: new Set() });
const tableOf = (res: ReturnType<typeof runMatching>, app: string) => res.tables.findIndex((t) => t.applicationIds.includes(app));

describe("피드백이 다음 매칭에 반영된다 (F11)", () => {
  it("후기에서 분위기·대화를 낮게 준 사람은 그때 함께 앉은 사람들과 '만족도 낮은 조합'이 된다", () => {
    const sig = feedbackSignals(
      [
        { user_id: "u0", table_id: "T1", mood_score: 2, talk_score: 1, rejoin_intent: 3, created_at: "2026-10-10" },
        { user_id: "u5", table_id: "T2", mood_score: 5, talk_score: 4, rejoin_intent: 5, created_at: "2026-10-10" },
      ],
      [{ user_id: "u0", table_id: "T1" }, { user_id: "u1", table_id: "T1" }, { user_id: "u2", table_id: "T1" }],
      new Map([["u0", 1], ["u1", 1], ["u2", 1], ["u5", 2]]),
    );
    expect([...sig.cool].sort()).toEqual([pairKey("u0", "u1"), pairKey("u0", "u2")].sort());
    expect(sig.history.get("u5")).toMatchObject({ attended: 2, happy: true });
    expect(sig.history.get("u0")).toMatchObject({ attended: 1, happy: false });
  });

  it("만족도가 낮았던 조합은 다음에 점수가 내려간다 (총점만, 확정 판정 점수는 그대로)", () => {
    const four = people.slice(0, 4);
    const before = scoreGroup(four, empty(), DEFAULT_SETTINGS);
    const rel = empty();
    rel.cool = new Set([pairKey("u0", "u1")]);
    const after = scoreGroup(four, rel, DEFAULT_SETTINGS);
    expect(after.coolPairs).toBe(1);
    expect(after.total).toBeLessThan(before.total);
    expect(after.gate).toBe(before.gate);
  });

  it("엔진이 실제로 다른 조합을 고른다: 지난번 별로였던 두 사람을 다음엔 다른 테이블에 앉힌다", () => {
    const base = runMatching(people, [slot], empty());
    expect(base.tables).toHaveLength(2);
    // 처음 결과에서 같은 테이블에 앉은 두 사람을 고른다 (나이·관심사·MBTI 결이 같아 다른 조건이 결과를 정하지 않게 했다)
    const t0 = base.tables[0].applicationIds;
    const [x, y] = [t0[0], t0[1]];
    const rel = empty();
    rel.cool = new Set([pairKey(x.replace("a", "u"), y.replace("a", "u"))]);
    const next = runMatching(people, [slot], rel);
    expect(next.tables).toHaveLength(2);
    expect(tableOf(next, x)).not.toBe(tableOf(next, y));
  });

  it("지난 모임을 즐겁게 보낸 재참가자가 첫 참가자와 함께면 가점", () => {
    const four = people.slice(0, 4);
    const rel = empty();
    rel.history = new Map([["u0", { attended: 3, happy: true }]]);
    const s = scoreGroup(four, rel, DEFAULT_SETTINGS);
    expect(s.guideBonus).toBe(2);
    expect(s.total).toBeGreaterThan(scoreGroup(four, empty(), DEFAULT_SETTINGS).total);
  });

  it("엔진이 후기로 자리를 나눈 테이블에는 이유 한 줄이 붙는다 (상대 이름 없이)", () => {
    const base = runMatching(people, [slot], empty());
    const t0 = base.tables[0].applicationIds;
    const rel = empty();
    rel.cool = new Set([pairKey(t0[0].replace("a", "u"), t0[1].replace("a", "u"))]);
    const next = runMatching(people, [slot], rel);
    const all = next.tables.flatMap((t) => t.reasons);
    expect(all).toContain("지난 모임 후기를 반영해 자리를 나눴어요");
    for (const line of all) expect(line).not.toMatch(/u\d|a\d/);
    // 후기 신호가 없으면 그 줄도 없다
    expect(base.tables.flatMap((t) => t.reasons)).not.toContain("지난 모임 후기를 반영해 자리를 나눴어요");
  });

  it("재참가자 가점도 이유에 사람 말로 들어간다", () => {
    const rel = empty();
    rel.history = new Map([["u0", { attended: 3, happy: true }]]);
    const s = scoreGroup(people.slice(0, 4), rel, DEFAULT_SETTINGS);
    expect(reasonsFor(s, DEFAULT_SETTINGS)).toContain("지난 모임을 즐겁게 보낸 분이 처음 오신 분과 함께해요");
  });
});

describe("참석이 쌓일수록 정교해진다 (F11: 여러 번의 후기 평균 + 참석 횟수 신뢰도)", () => {
  const seat = (u: string, t: string) => ({ user_id: u, table_id: t });

  it("같은 상대와 두 번 앉았으면 두 후기를 평균한다: 한 번 별로였어도 다음번이 좋았으면 감점이 풀린다", () => {
    const seats = [seat("u0", "T1"), seat("u1", "T1"), seat("u0", "T2"), seat("u1", "T2")];
    const once = feedbackSignals([{ user_id: "u0", table_id: "T1", mood_score: 1, talk_score: 2, rejoin_intent: 2 }], seats, new Map([["u0", 1]]));
    expect(once.cool.has(pairKey("u0", "u1"))).toBe(true);
    const twice = feedbackSignals(
      [
        { user_id: "u0", table_id: "T1", mood_score: 1, talk_score: 2, rejoin_intent: 2 },
        { user_id: "u0", table_id: "T2", mood_score: 5, talk_score: 4, rejoin_intent: 4 },
      ],
      seats,
      new Map([["u0", 2]]),
    );
    expect(twice.cool.has(pairKey("u0", "u1"))).toBe(false);
  });

  it("만족 여부도 마지막 한 번이 아니라 전체 후기 평균으로 본다", () => {
    const fbs = [
      { user_id: "u0", table_id: "T1", mood_score: 5, talk_score: 5, rejoin_intent: 5, created_at: "2026-10-01" },
      { user_id: "u0", table_id: "T2", mood_score: 4, talk_score: 3, rejoin_intent: 3, created_at: "2026-10-08" }, // 마지막은 보통
      { user_id: "u0", table_id: "T3", mood_score: 5, talk_score: 4, rejoin_intent: 4, created_at: "2026-10-15" },
    ];
    expect(feedbackSignals(fbs, [], new Map([["u0", 3]])).history.get("u0")).toEqual({ attended: 3, happy: true, trust: 1 });
    // 마지막 한 번만 아주 좋았던 경우: 평균이 낮으면 만족한 재참가자로 보지 않는다
    const mixed = [
      { user_id: "u1", table_id: "T1", mood_score: 2, talk_score: 2, rejoin_intent: 2, created_at: "2026-10-01" },
      { user_id: "u1", table_id: "T2", mood_score: 2, talk_score: 3, rejoin_intent: 2, created_at: "2026-10-08" },
      { user_id: "u1", table_id: "T3", mood_score: 5, talk_score: 5, rejoin_intent: 5, created_at: "2026-10-15" },
    ];
    expect(feedbackSignals(mixed, [], new Map([["u1", 3]])).history.get("u1")?.happy).toBe(false);
  });

  it("참석이 많은 사람의 후기일수록 감점이 크다 (1회 0.5배 → 3회 이상 1배)", () => {
    expect(trustOf(1)).toBeCloseTo(1 / 3);
    expect(trustOf(3)).toBe(1);
    expect(trustOf(10)).toBe(1);
    const seats = [seat("u0", "T1"), seat("u1", "T1")];
    const low = [{ user_id: "u0", table_id: "T1", mood_score: 1, talk_score: 1, rejoin_intent: 1 }];
    const rookie = feedbackSignals(low, seats, new Map([["u0", 1]]));
    const veteran = feedbackSignals(low, seats, new Map([["u0", 3]]));
    const k = pairKey("u0", "u1");
    expect(rookie.coolWeight.get(k)).toBeCloseTo(0.67, 2);
    expect(veteran.coolWeight.get(k)).toBe(1);

    const four = people.slice(0, 4);
    const pen = (sig: ReturnType<typeof feedbackSignals>) => scoreGroup(four, { ...empty(), cool: sig.cool, coolWeight: sig.coolWeight }, DEFAULT_SETTINGS).penalty;
    expect(pen(rookie)).toBe(2);
    expect(pen(veteran)).toBe(3);
  });

  it("즐거웠던 재참가자 가점도 참석 횟수만큼 믿는다 (1회 0.7점 → 3회 2점)", () => {
    const four = people.slice(0, 4);
    const bonus = (attended: number) => {
      const rel = empty();
      rel.history = new Map([["u0", { attended, happy: true, trust: trustOf(attended) }]]);
      return scoreGroup(four, rel, DEFAULT_SETTINGS).guideBonus;
    };
    expect(bonus(1)).toBe(0.7);
    expect(bonus(2)).toBe(1.3);
    expect(bonus(3)).toBe(2);
  });
});
