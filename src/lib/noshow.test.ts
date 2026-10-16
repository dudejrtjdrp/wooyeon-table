import { describe, expect, it } from "vitest";
import { noShowStep } from "./noshow";

describe("노쇼 단계 (최근 90일)", () => {
  it("1회 경고, 2회 30일 제한, 3회부터 운영자 영구 제한 검토", () => {
    expect(noShowStep(1)).toBe("warn");
    expect(noShowStep(2)).toBe("restrict");
    expect(noShowStep(3)).toBe("review");
    expect(noShowStep(5)).toBe("review");
  });
});
