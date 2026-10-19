import { describe, expect, it } from "vitest";
import { blockedReason } from "./blocked";

const at = new Date("2026-10-21T00:00:00Z");
describe("계정 제한 때문에 매칭에서 빼기", () => {
  it("영구 제한은 뺀다", () => {
    expect(blockedReason("banned", null, at)).toContain("영구 제한");
  });
  it("기한이 남았거나 기한 없는 신청 제한은 뺀다", () => {
    expect(blockedReason("restricted", "2026-11-01T00:00:00Z", at)).toContain("매칭에서 뺐어요");
    expect(blockedReason("restricted", null, at)).toContain("기한 없음");
  });
  it("기한이 지난 제한과 정상·경고 계정은 넣는다", () => {
    expect(blockedReason("restricted", "2026-10-20T00:00:00Z", at)).toBeNull();
    expect(blockedReason("active", null, at)).toBeNull();
    expect(blockedReason("warned", null, at)).toBeNull();
  });
});
