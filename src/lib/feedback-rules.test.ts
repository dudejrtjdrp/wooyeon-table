import { describe, expect, it } from "vitest";
import { SCORES_MISSING_MSG, afterMeetingCard, parseFeedbackScores, parseMissing } from "./feedback-rules";
import { isDemoMode } from "./demo-mode";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("후기 별점 검증", () => {
  it("다섯 개 모두 고르면 통과하고 열 이름으로 돌려준다", () => {
    const r = parseFeedbackScores(form({ mood: "5", talk: "4", venue: "3", rejoin: "5", recommend: "1" }));
    expect(r).toEqual({ ok: true, scores: { mood_score: 5, talk_score: 4, venue_score: 3, rejoin_intent: 5, recommend_intent: 1 } });
  });
  it("하나도 안 고르면 다섯 개 모두 빠졌다고 한다", () => {
    const r = parseFeedbackScores(form({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["mood", "talk", "venue", "rejoin", "recommend"]);
  });
  it("일부만 고르면 빠진 것만, 고른 값은 남긴다", () => {
    const r = parseFeedbackScores(form({ mood: "4", talk: "", venue: "0", rejoin: "6", recommend: "2" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toEqual(["talk", "venue", "rejoin"]);
      expect(r.given).toEqual({ mood: 4, recommend: 2 });
    }
  });
  it("소수·문자는 별점이 아니다", () => {
    const r = parseFeedbackScores(form({ mood: "3.5", talk: "abc", venue: "3", rejoin: "3", recommend: "3" }));
    expect(r.ok).toBe(false);
  });
  it("사람 고르기·한마디는 없어도 된다", () => {
    expect(parseFeedbackScores(form({ mood: "3", talk: "3", venue: "3", rejoin: "3", recommend: "3" })).ok).toBe(true);
  });
  it("주소의 빠진 항목은 아는 이름만", () => {
    expect(parseMissing("mood,foo,recommend")).toEqual(["mood", "recommend"]);
    expect(parseMissing(undefined)).toEqual([]);
    expect(SCORES_MISSING_MSG).toBe("별점을 모두 골라 주세요");
  });
});

describe("끝난 모임 홈 안내", () => {
  const end = new Date("2026-10-23T22:00:00+09:00");
  const h = (n: number) => new Date(end.getTime() + n * 3600_000);
  it("참석했고 후기가 없으면 후기 남기기", () => {
    expect(afterMeetingCard({ attendance: "ATTENDED", ended: true, endsAt: end, reviewed: false, claimed: false, t: h(1) })).toBe("review");
  });
  it("후기를 남겼거나 아직 안 끝났거나 7일이 지나면 없음", () => {
    expect(afterMeetingCard({ attendance: "ATTENDED", ended: true, endsAt: end, reviewed: true, claimed: false, t: h(1) })).toBeNull();
    expect(afterMeetingCard({ attendance: "ATTENDED", ended: false, endsAt: end, reviewed: false, claimed: false, t: h(-1) })).toBeNull();
    expect(afterMeetingCard({ attendance: "ATTENDED", ended: true, endsAt: end, reviewed: false, claimed: false, t: h(24 * 8) })).toBeNull();
  });
  it("체크인을 못 했으면 48시간 안에 한 번 알리라고", () => {
    expect(afterMeetingCard({ attendance: "SCHEDULED", ended: true, endsAt: end, reviewed: false, claimed: false, t: h(2) })).toBe("claim");
    expect(afterMeetingCard({ attendance: "SCHEDULED", ended: true, endsAt: end, reviewed: false, claimed: true, t: h(2) })).toBeNull();
    expect(afterMeetingCard({ attendance: "SCHEDULED", ended: true, endsAt: end, reviewed: false, claimed: false, t: h(49) })).toBeNull();
    expect(afterMeetingCard({ attendance: "NO_SHOW", ended: true, endsAt: end, reviewed: false, claimed: false, t: h(2) })).toBeNull();
  });
});

describe("시연 중인지", () => {
  it("시계를 옮겼거나 시연 계정이면 시연 중", () => {
    expect(isDemoMode({ offsetSeconds: 0 })).toBe(false);
    expect(isDemoMode({ offsetSeconds: null, demoUser: false })).toBe(false);
    expect(isDemoMode({ offsetSeconds: 3600 })).toBe(false); // 시계만 옮겨서는 안 보인다(비로그인·실제 회원)
    expect(isDemoMode({ offsetSeconds: 0, demoUser: true })).toBe(true);
  });
});
