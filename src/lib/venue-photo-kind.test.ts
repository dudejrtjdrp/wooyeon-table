import { describe, expect, it } from "vitest";
import { isAiPhoto } from "./venue-photo-kind";

describe("AI 분위기 사진 구분", () => {
  it("public/venues/ai-* 만 AI 사진으로 본다", () => {
    expect(isAiPhoto("/venues/ai-03.jpg")).toBe(true);
    expect(isAiPhoto("/venues/ai-03.jpg?v=2")).toBe(true);
    expect(isAiPhoto("/api/venue-photo/abc?v=1")).toBe(false);
    expect(isAiPhoto(null)).toBe(false);
    expect(isAiPhoto("https://evil.example/venues/ai-1.jpg")).toBe(false);
  });
});
