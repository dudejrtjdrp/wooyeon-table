import { describe, expect, it } from "vitest";
import { pickMove } from "./admin-ops";
import type { Member } from "./attendance";
import { DEFAULT_SETTINGS, type Relations, pairKey } from "./matching/types";

const m = (id: string, birth: number, slots = ["s1"]): Member => ({ id, user_id: `u-${id}`, birth_year: birth, slotIds: slots, name: id });
const rel = (pairs: [string, string][] = []): Relations => ({ excluded: new Set(pairs.map(([a, b]) => pairKey(`u-${a}`, `u-${b}`))), met: new Set(), again: new Set() });

describe("pickMove: 조건 충돌 예외의 이동 추천", () => {
  const home = [m("a", 1995), m("b", 1996), m("c", 1997), m("old", 1984)];

  it("나이 차를 깨는 사람을 나이 조건이 맞는 첫 테이블로 옮긴다", () => {
    const sibs = [
      { id: "t-young", slot_id: "s1", members: [m("y1", 1998), m("y2", 1999), m("y3", 2000), m("y4", 2000)] },
      { id: "t-old", slot_id: "s1", members: [m("o1", 1985), m("o2", 1987), m("o3", 1988), m("o4", 1990)] },
    ];
    const p = pickMove(home, sibs, rel(), DEFAULT_SETTINGS);
    expect(p?.mover.id).toBe("old");
    expect(p?.target.id).toBe("t-old");
  });

  it("고르지 않은 일정·가득 찬 테이블·차단 관계는 건너뛴다", () => {
    const sibs = [
      { id: "other-slot", slot_id: "s2", members: [m("o1", 1985)] },
      { id: "full", slot_id: "s1", members: [1, 2, 3, 4, 5, 6].map((i) => m(`f${i}`, 1986)) },
      { id: "blocked", slot_id: "s1", members: [m("x", 1986)] },
      { id: "ok", slot_id: "s1", members: [m("z", 1987)] },
    ];
    const p = pickMove(home, sibs, rel([["old", "x"]]), DEFAULT_SETTINGS);
    expect(p?.target.id).toBe("ok");
  });

  it("신청에 걸린 예외면 그 사람만 보고, 받아 줄 곳이 없으면 null", () => {
    const sibs = [{ id: "t", slot_id: "s1", members: [m("y", 2001)] }];
    expect(pickMove(home, sibs, rel(), DEFAULT_SETTINGS, "a")?.mover.id).toBe("a");
    expect(pickMove(home, sibs, rel(), DEFAULT_SETTINGS, "old")).toBeNull();
  });
});

describe("긴급 수정은 예외 상황에서만 (emergencyGate)", () => {
  it("예외함 카드에서 들어오면 사유 그대로", async () => {
    const { emergencyGate } = await import("./admin-ops");
    expect(emergencyGate("ex-1", false, "신고 접수로 분리")).toEqual({ ok: true, reason: "신고 접수로 분리" });
  });
  it("예외 없이 들어오면 확인 없이는 막는다", async () => {
    const { emergencyGate } = await import("./admin-ops");
    expect(emergencyGate(null, false, "그냥 옮김").ok).toBe(false);
  });
  it("확인하면 이력 사유에 [예외 없이]를 붙인다", async () => {
    const { emergencyGate } = await import("./admin-ops");
    expect(emergencyGate(null, true, "참가자 전화로 불참")).toEqual({ ok: true, reason: "[예외 없이] 참가자 전화로 불참" });
  });
});
