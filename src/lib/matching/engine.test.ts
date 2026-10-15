import { describe, expect, it } from "vitest";
import { validateTable } from "./constraints";
import { runMatching } from "./engine";
import { mbtiPair } from "./score";
import { type Candidate, DEFAULT_SETTINGS, type Relations, type Slot, pairKey } from "./types";

// 재현 가능한 의사 난수
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const INTERESTS = ["맛집", "여행", "운동", "영화", "음악", "독서", "전시", "와인", "게임", "사진"];
const TRAITS = ["유쾌한", "차분한", "다정한", "솔직한", "호기심 많은", "리액션 좋은"];
const MBTIS = ["ENFP", "INFP", "ENTJ", "INTJ", "ESFJ", "ISFJ", "ESTP", "ISTP", "ENFJ", "INFJ", "ENTP", "INTP"];

const slots: Slot[] = [
  { id: "s-fri-seongsu", region: "성수", startsAt: "2026-10-23T10:30:00Z", maxTables: 4 },
  { id: "s-fri-gangnam", region: "강남", startsAt: "2026-10-23T10:30:00Z", maxTables: 4 },
  { id: "s-sat-seongsu", region: "성수", startsAt: "2026-10-24T10:30:00Z", maxTables: 4 },
];

function makeCandidates(n: number, seed = 7): Candidate[] {
  const r = rng(seed);
  const pick = <T,>(arr: T[], k: number) => [...arr].sort(() => r() - 0.5).slice(0, k);
  return Array.from({ length: n }, (_, i) => ({
    applicationId: `app-${String(i).padStart(3, "0")}`,
    userId: `user-${String(i).padStart(3, "0")}`,
    birthYear: 1992 + Math.floor(r() * 10),
    gender: r() < 0.5 ? "M" : "F",
    mbti: MBTIS[Math.floor(r() * MBTIS.length)],
    interests: pick(INTERESTS, 3),
    myTraits: pick(TRAITS, 2),
    wantedTraits: pick(TRAITS, 1),
    slotIds: pick(
      slots.map((s) => s.id),
      1 + Math.floor(r() * 3),
    ),
  }));
}

const emptyRel = (): Relations => ({ excluded: new Set(), met: new Set(), again: new Set() });

function checkInvariants(cands: Candidate[], rel: Relations) {
  const res = runMatching(cands, slots, rel);
  const byApp = new Map(cands.map((c) => [c.applicationId, c]));
  const seen = new Set<string>();
  for (const t of res.tables) {
    const members = t.applicationIds.map((id) => byApp.get(id)!);
    expect(validateTable(members, t.slotId, rel, DEFAULT_SETTINGS)).toEqual([]);
    expect(t.score.total).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minScore);
    for (const id of t.applicationIds) {
      expect(seen.has(id)).toBe(false); // 한 사람은 한 테이블에만
      seen.add(id);
    }
  }
  // 모든 신청에 결과가 있다
  for (const c of cands) expect(res.outcomes[c.applicationId]).toBeDefined();
  // 테이블 수 제한
  for (const s of slots) expect(res.tables.filter((t) => t.slotId === s.id).length).toBeLessThanOrEqual(s.maxTables);
  return res;
}

describe("MBTI 두 사람 점수", () => {
  it("규칙 네 줄 그대로 계산한다", () => {
    expect(mbtiPair("ENFP", "INFP")).toBeCloseTo(1.0); // N 같음 + E/I 다름 + P 같음 + 0.1
    expect(mbtiPair("ESTJ", "ENFP")).toBeCloseTo(0.3); // E·E 0.2 + 0.1
    expect(mbtiPair(null, "INTJ")).toBe(0.5);
  });
});

describe("자동 매칭", () => {
  it("필수 조건을 지키는 4~6인 테이블만 확정한다", () => {
    const res = checkInvariants(makeCandidates(40), emptyRel());
    expect(res.summary.confirmed).toBeGreaterThan(0);
  });

  it("여러 시드에서도 조건이 깨지지 않는다", () => {
    for (let seed = 1; seed <= 30; seed++) checkInvariants(makeCandidates(25 + seed, seed), emptyRel());
  });

  it("같은 입력이면 같은 결과가 나온다", () => {
    const c = makeCandidates(30, 3);
    expect(JSON.stringify(runMatching(c, slots, emptyRel()))).toBe(JSON.stringify(runMatching(c, slots, emptyRel())));
  });

  it("차단·비선호 관계는 같은 테이블에 앉히지 않는다", () => {
    const c = makeCandidates(30, 11);
    const rel = emptyRel();
    for (let i = 0; i < 10; i++) rel.excluded.add(pairKey(c[i].userId, c[i + 1].userId));
    const res = checkInvariants(c, rel);
    for (const t of res.tables) {
      const users = t.applicationIds.map((id) => c.find((x) => x.applicationId === id)!.userId);
      for (let i = 0; i < users.length; i++)
        for (let j = i + 1; j < users.length; j++) expect(rel.excluded.has(pairKey(users[i], users[j]))).toBe(false);
    }
  });

  it("나이 차가 8살을 넘는 사람은 같은 테이블에 없다", () => {
    const c = makeCandidates(12, 5).map((x, i) => ({ ...x, birthYear: i < 6 ? 1985 : 2000, slotIds: ["s-fri-seongsu"] }));
    const res = checkInvariants(c, emptyRel());
    for (const t of res.tables) expect(t.score.ageGap).toBeLessThanOrEqual(8);
  });

  it("3명뿐인 일정의 신청자는 함께 고른 다른 일정 테이블로 재배치된다", () => {
    const base = makeCandidates(8, 21).map((x) => ({ ...x, birthYear: 1996, slotIds: ["s-fri-seongsu"] }));
    // 성수 금요일 5명 + 강남 금요일만 고른 3명(성수도 가능)
    const c = base.map((x, i) =>
      i >= 5 ? { ...x, slotIds: ["s-fri-gangnam", "s-fri-seongsu"] } : x,
    );
    const res = checkInvariants(c, emptyRel());
    const placed = Object.values(res.outcomes).filter((o) => o.status === "CONFIRMED").length;
    expect(placed).toBe(8);
  });

  it("어디에도 못 앉으면 대안 안내 상태가 된다", () => {
    const c = makeCandidates(3, 9).map((x) => ({ ...x, slotIds: ["s-sat-seongsu"] }));
    const res = runMatching(c, slots, emptyRel());
    expect(Object.values(res.outcomes).every((o) => o.status === "ALTERNATIVE_OFFERED")).toBe(true);
  });

  it("이전에 만난 사람보다 처음 보는 사람을 우선한다", () => {
    const c = makeCandidates(12, 13).map((x) => ({ ...x, birthYear: 1995, slotIds: ["s-fri-seongsu"] }));
    const rel = emptyRel();
    // 앞의 6명은 지난번에 서로 만났다
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) rel.met.add(pairKey(c[i].userId, c[j].userId));
    const res = checkInvariants(c, rel);
    const metPairs = res.tables.reduce((a, t) => a + t.score.metPairs, 0);
    expect(metPairs).toBeLessThan(15); // 6명을 그대로 다시 묶으면 15쌍
  });

  it("40명 기준 결과 요약", () => {
    const res = checkInvariants(makeCandidates(40, 7), emptyRel());
    const avg = res.tables.reduce((a, t) => a + t.score.total, 0) / Math.max(1, res.tables.length);
    console.log("요약", res.summary, "평균 점수", avg.toFixed(1));
    console.log(res.log.join("\n"));
    expect(res.summary.confirmed / res.summary.candidates).toBeGreaterThan(0.7);
  });
});

describe("가까운 동네 확장 (2026-10-16)", () => {
  // 같은 날 서울 두 묶음: 성수·건대에는 3명, 강남·역삼·선릉에는 3명뿐이라 각자로는 4명이 안 된다
  const nearSlots: Slot[] = [
    { id: "s-seongsu", region: "성수·건대", startsAt: "2026-10-23T10:30:00Z", maxTables: 2 },
    { id: "s-gangnam", region: "강남·역삼·선릉", startsAt: "2026-10-23T10:30:00Z", maxTables: 2 },
  ];
  const six = (nearOk: (i: number) => boolean) =>
    makeCandidates(6, 31).map((x, i) => {
      const own = i < 3 ? "s-seongsu" : "s-gangnam";
      const other = i < 3 ? "s-gangnam" : "s-seongsu";
      return { ...x, birthYear: 1995, slotIds: [own], nearSlotIds: nearOk(i) ? [other] : undefined };
    });

  it("체크한 사람은 가까운 동네(이웃 일정)로 옮겨 테이블을 만든다", () => {
    const c = six(() => true);
    const res = runMatching(c, nearSlots, emptyRel());
    expect(res.summary.confirmed).toBe(6);
    expect(res.summary.widened).toBeGreaterThanOrEqual(3);
    // 옮겨 간 사람은 메시지에 가까운 동네라고 알려 준다
    const moved = Object.values(res.outcomes).filter((o) => o.status === "CONFIRMED" && o.message.includes("가까운 동네"));
    expect(moved.length).toBeGreaterThanOrEqual(3);
  });

  it("체크 안 한 사람은 고른 묶음 밖으로 보내지 않는다", () => {
    const c = six(() => false);
    const res = runMatching(c, nearSlots, emptyRel());
    expect(res.summary.confirmed).toBe(0);
    for (const o of Object.values(res.outcomes)) {
      expect(o.status).toBe("ALTERNATIVE_OFFERED");
      expect(o.message).toBe("고른 동네에서 4명이 안 모였어요");
    }
  });

  it("섞여 있으면 체크한 사람만 넘어가고, 확정 테이블엔 고른 묶음이거나 허용한 사람만 앉는다", () => {
    // 강남 3명 중 2명만 체크 → 성수 3명 + 강남에서 넘어온 2명 = 5명 테이블, 체크 안 한 1명은 실패
    const c = six((i) => i === 3 || i === 4);
    const res = runMatching(c, nearSlots, emptyRel());
    const byApp = new Map(c.map((x) => [x.applicationId, x]));
    for (const t of res.tables) {
      for (const id of t.applicationIds) {
        const orig = byApp.get(id)!;
        expect([...orig.slotIds, ...(orig.nearSlotIds ?? [])]).toContain(t.slotId);
      }
    }
    expect(res.outcomes[c[5].applicationId].status).toBe("ALTERNATIVE_OFFERED");
    expect(res.summary.confirmed).toBe(5);
  });

  it("먼저 고른 묶음 안에서 해결되면 넓히지 않는다", () => {
    const c = makeCandidates(8, 41).map((x) => ({ ...x, birthYear: 1996, slotIds: ["s-seongsu"], nearSlotIds: ["s-gangnam"] }));
    const res = runMatching(c, nearSlots, emptyRel());
    expect(res.summary.widened).toBe(0);
    expect(res.tables.every((t) => t.slotId === "s-seongsu")).toBe(true);
  });
});
