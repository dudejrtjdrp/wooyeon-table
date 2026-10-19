import { describe, expect, it } from "vitest";
import { meetingEnded } from "./meeting-time";

describe("지난 모임 기준", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("모임 끝(DONE)이거나 끝나는 시각이 지났으면 지난 모임", () => {
    expect(meetingEnded({ status: "DONE", slots: { ends_at: "2026-11-20T13:00:00Z" } }, now)).toBe(true);
    expect(meetingEnded({ status: "READY", slots: { ends_at: "2026-11-10T11:59:00Z" } }, now)).toBe(true);
    expect(meetingEnded({ status: "READY", slots: { ends_at: "2026-11-10T12:30:00Z" } }, now)).toBe(false);
    expect(meetingEnded(null, now)).toBe(false);
  });
});
