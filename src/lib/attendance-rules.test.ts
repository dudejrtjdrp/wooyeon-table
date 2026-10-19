import { describe, expect, it } from "vitest";
import { afterMeetingNote, canClaimAttended, failureMoment, shouldNudgeCheckIn } from "./attendance-rules";

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

describe("끝난 모임 안내", () => {
  it("참석·알림 여부·기한에 따라 할 수 있는 일만 말한다", () => {
    expect(afterMeetingNote({ attended: true, canClaim: false, claimed: false }).text).toContain("후기는");
    expect(afterMeetingNote({ attended: false, canClaim: true, claimed: false }).text).toContain("참석했는데 체크인을 못 했어요");
    expect(afterMeetingNote({ attended: false, canClaim: true, claimed: true }).text).toContain("운영팀이 확인");
    expect(afterMeetingNote({ attended: false, canClaim: false, claimed: false })).toMatchObject({ contact: true });
    // 알린 뒤 운영자가 노쇼로 정했으면 '확인 중'이 아니라 문의하기
    expect(afterMeetingNote({ attended: false, canClaim: false, claimed: true, status: "NO_SHOW" })).toMatchObject({ contact: true });
  });
});
