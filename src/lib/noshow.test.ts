import { describe, expect, it } from "vitest";
import { countNoShows, noShowStep } from "./noshow";

describe("노쇼 단계 (최근 90일)", () => {
  it("1회 경고, 2회 30일 제한, 3회부터 운영자 영구 제한 검토", () => {
    expect(noShowStep(1)).toBe("warn");
    expect(noShowStep(2)).toBe("restrict");
    expect(noShowStep(3)).toBe("review");
    expect(noShowStep(5)).toBe("review");
  });
});

describe("노쇼 횟수 세기", () => {
  it("되돌린 노쇼는 세지 않고, 같은 신청은 한 번만, 이번 신청은 늘 센다", () => {
    const ev = [{ entity_id: "a" }, { entity_id: "b" }, { entity_id: "a" }, { entity_id: "c" }];
    // a는 되돌렸다가 다시 노쇼(기록 두 번), b는 되돌려서 지금은 참석 예정, c는 지금 확정하는 신청
    expect(countNoShows(ev, ["a", "c"], "c")).toBe(2);
    // 기록이 아직 안 보여도 이번 신청은 센다
    expect(countNoShows([], ["c"], "c")).toBe(1);
  });
});
