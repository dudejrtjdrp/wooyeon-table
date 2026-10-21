import { describe, expect, it } from "vitest";
import { askedKey, shouldAskPush } from "./push-ask";

const base = { supported: true, permission: "default" as const, subscribed: false, asked: false };

describe("알림은 처음 들어왔을 때 한 번만 묻는다", () => {
  it("처음이고 아직 정하지 않았으면 묻는다", () => {
    expect(shouldAskPush(base)).toBe(true);
  });
  it("이미 물어봤거나, 켰거나, 막았거나, 지원하지 않으면 묻지 않는다", () => {
    expect(shouldAskPush({ ...base, asked: true })).toBe(false);
    expect(shouldAskPush({ ...base, subscribed: true })).toBe(false);
    expect(shouldAskPush({ ...base, permission: "granted" })).toBe(false);
    expect(shouldAskPush({ ...base, permission: "denied" })).toBe(false);
    expect(shouldAskPush({ ...base, supported: false })).toBe(false);
  });
  it("앱으로 설치해 처음 열면 브라우저에서 물어본 것과 따로 한 번 더 물을 수 있다", () => {
    expect(askedKey(true)).not.toBe(askedKey(false));
  });
});
