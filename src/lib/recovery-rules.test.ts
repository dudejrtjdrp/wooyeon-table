import { describe, expect, it } from "vitest";
import { justConfirmed, runCutoffs } from "./recovery-rules";

describe("복구 판정은 시연 시계 기준", () => {
  const real = new Date("2026-10-20T12:00:00Z");
  const demo = new Date(real.getTime() + 3 * 86400_000); // 시계를 3일 앞당긴 시연

  it("시연 시계로 확정한 지 10분 지난 테이블은 다시 안내 대상이다", () => {
    const confirmedAt = new Date(demo.getTime() - 10 * 60_000).toISOString();
    expect(justConfirmed(confirmedAt, demo)).toBe(false);
  });
  it("확정한 지 1분 된 테이블은 건너뛴다", () => {
    expect(justConfirmed(new Date(demo.getTime() - 60_000).toISOString(), demo)).toBe(true);
  });
  it("시계를 앞당긴 뒤 시작한 실행도 10분이 지나면 멈춘 것으로 본다", () => {
    const startedAt = new Date(demo.getTime() - 11 * 60_000).toISOString();
    const { stuckBefore, recent } = runCutoffs(demo);
    expect(startedAt < stuckBefore).toBe(true);
    expect(startedAt > recent).toBe(true);
  });
});
