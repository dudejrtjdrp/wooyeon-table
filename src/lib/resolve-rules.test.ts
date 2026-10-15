import { describe, expect, it } from "vitest";
import { moveTag, noAnswerStep, waitDeadline } from "./resolve-rules";

const H = 3600_000;
const D = 24 * H;

describe("매칭 실패 뒤 규칙 (2026-10-16)", () => {
  it("옮길 일정은 고른 동네 → 옆 동네 → 같은 시·도 순, 다른 시·도는 추천하지 않는다", () => {
    const liked = ["성수·건대"];
    expect(moveTag("성수·건대", "서울", liked)).toBe("고른 동네");
    expect(moveTag("잠실·송파", "서울", liked)).toBe("옆 동네");
    expect(moveTag("마곡·목동", "서울", liked)).toBe("조금 멀어요");
    expect(moveTag("서면", "부산", liked)).toBeNull();
  });

  it("기다리기 마감은 고른 모임 중 가장 늦은 것의 2일 전", () => {
    const at = new Date("2026-10-20T00:00:00Z");
    const until = waitDeadline(["2026-10-23T10:30:00Z", "2026-10-30T10:30:00Z"], at);
    expect(until?.toISOString()).toBe("2026-10-28T10:30:00.000Z");
  });

  it("모임이 2일 안이면 기다리기를 고를 수 없다", () => {
    expect(waitDeadline(["2026-10-21T10:30:00Z"], new Date("2026-10-20T00:00:00Z"))).toBeNull();
    expect(waitDeadline([], new Date())).toBeNull();
  });

  it("무응답이면 2일째 한 번 알리고 3일째 이용권으로 보관한다", () => {
    const failed = new Date("2026-10-20T00:00:00Z");
    expect(noAnswerStep(failed, new Date(failed.getTime() + D))).toBeNull();
    expect(noAnswerStep(failed, new Date(failed.getTime() + 2 * D + H))).toBe("remind");
    expect(noAnswerStep(failed, new Date(failed.getTime() + 3 * D))).toBe("keep");
  });

  it("규칙을 켜기 전에 실패한 신청은 켠 날부터 3일을 센다", () => {
    const old = new Date("2026-10-10T00:00:00Z");
    expect(noAnswerStep(old, new Date("2026-10-17T12:00:00+09:00"))).toBeNull();
    expect(noAnswerStep(old, new Date("2026-10-20T00:00:00+09:00"))).toBe("keep");
  });
});
