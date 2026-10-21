import { describe, expect, it } from "vitest";
import { expiryKey, expiryStage } from "./pass-expiry";

describe("expiryStage: 이용권 기한 7일·3일·하루 전 세 번", () => {
  const exp = "2026-11-20T00:00:00+09:00";
  const at = (s: string) => new Date(s);
  it("7일보다 많이 남았거나 이미 지났으면 보내지 않는다", () => {
    expect(expiryStage(exp, at("2026-11-12T00:00:00+09:00"))).toBeNull();
    expect(expiryStage(exp, at("2026-11-20T00:00:00+09:00"))).toBeNull();
  });
  it("7일 안 → 일주일, 3일 안 → 3일, 하루 안 → 하루", () => {
    expect(expiryStage(exp, at("2026-11-13T00:00:00+09:00"))?.key).toBe("d7");
    expect(expiryStage(exp, at("2026-11-17T00:00:00+09:00"))?.key).toBe("d3");
    expect(expiryStage(exp, at("2026-11-19T12:00:00+09:00"))?.key).toBe("d1");
  });
});

describe("expiryKey: 기한이 늘면 다시 알린다", () => {
  it("같은 기한·단계면 같은 키, 기한이 바뀌면 다른 키", () => {
    const a = expiryKey("p1", "2026-11-20T00:00:00+09:00", "d7");
    expect(expiryKey("p1", "2026-11-20T00:00:00+09:00", "d7")).toBe(a);
    expect(expiryKey("p1", "2026-11-27T00:00:00+09:00", "d7")).not.toBe(a);
  });
});
