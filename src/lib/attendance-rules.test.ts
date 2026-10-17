import { describe, expect, it } from "vitest";
import { canClaimAttended, failureMoment, shouldNudgeCheckIn } from "./attendance-rules";

const at = (s: string) => new Date(`2026-10-23T${s}:00+09:00`);
const start = at("19:30"), end = at("22:00");

describe("체크인 시간 판정", () => {
  it("시작 20분이 지나고 끝나기 전에만 체크인 안내를 보낸다", () => {
    expect(shouldNudgeCheckIn(start, end, at("19:45"))).toBe(false);
    expect(shouldNudgeCheckIn(start, end, at("19:50"))).toBe(true);
    expect(shouldNudgeCheckIn(start, end, at("22:00"))).toBe(false);
  });
  it("'참석했어요' 알리기는 체크인 안 한 사람만, 끝난 뒤 48시간 안에만", () => {
    expect(canClaimAttended("SCHEDULED", end, at("21:00"))).toBe(false);
    expect(canClaimAttended("SCHEDULED", end, at("22:30"))).toBe(true);
    expect(canClaimAttended("ATTENDED", end, at("22:30"))).toBe(false);
    expect(canClaimAttended("SCHEDULED", end, new Date(end.getTime() + 49 * 3600_000))).toBe(false);
  });
  it("매칭 실패 시각은 감사 로그와 매칭 시각 중 늦은 쪽", () => {
    const logged = new Date("2026-10-18T00:35:00+09:00");
    expect(failureMoment(logged, "2026-10-28T00:00:00+09:00").toISOString()).toBe(new Date("2026-10-28T00:00:00+09:00").toISOString());
    expect(failureMoment(logged, "2026-10-01T00:00:00+09:00")).toBe(logged);
    expect(failureMoment(logged, null)).toBe(logged);
  });
});
