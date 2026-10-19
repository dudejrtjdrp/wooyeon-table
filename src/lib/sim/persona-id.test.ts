import { describe, expect, it } from "vitest";
import { isBot } from "./persona-id";

describe("시연 봇 구분", () => {
  it("is_demo이면서 test-로 시작하는 계정만 봇", () => {
    expect(isBot({ login_id: "test-bot-ab12-1", is_demo: true })).toBe(true);
    expect(isBot({ login_id: "test-x1-3", is_demo: true })).toBe(true);
    // 시연 참가자 계정(010…)은 사람
    expect(isBot({ login_id: "01091000000", is_demo: true })).toBe(false);
    // 실제 회원은 아이디가 test-로 시작해도 봇이 아니다
    expect(isBot({ login_id: "test-real", is_demo: false })).toBe(false);
    expect(isBot(null)).toBe(false);
  });
});
