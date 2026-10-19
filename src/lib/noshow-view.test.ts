import { describe, expect, it } from "vitest";
import { fromStart, noShowFacts } from "./noshow-view";

// 모임 시작: 10월 23일 저녁 7:30 (서울)
const START = "2026-10-23T10:30:00Z";
const team = (checked: number, total = 6) => [
  { userId: "me", attendance: "SCHEDULED" },
  ...Array.from({ length: total - 1 }, (_, i) => ({ userId: `u${i}`, attendance: i < checked ? "ATTENDED" : "SCHEDULED" })),
];

describe("노쇼 후보 카드 근거", () => {
  it("시작 기준 전·뒤", () => {
    expect(fromStart("2026-10-23T10:18:00Z", START)).toBe("시작 12분 전");
    expect(fromStart("2026-10-23T11:45:00Z", START)).toBe("시작 1시간 15분 뒤");
    expect(fromStart("2026-10-23T12:30:00Z", START)).toBe("시작 2시간 뒤");
    expect(fromStart(START, START)).toBe("시작 시각");
    expect(fromStart(START, null)).toBe("");
  });

  it("다른 사람은 체크인했고 아무 흔적이 없으면 노쇼 확정 쪽", () => {
    const f = noShowFacts({ members: team(5), userId: "me", startsAt: START });
    expect(f.checkin).toBe("같은 테이블 6명 중 5명 체크인");
    expect(f.late).toBe("'늦을 것 같아요' 기록 없음");
    expect(f.chat).toBe("단체방에서 말한 적 없음");
    expect(f.lean).toBe("noshow");
    expect(f.advice).toContain("같은 테이블 5명은 체크인했어요");
    expect(f.advice).toContain("'노쇼 확정'");
    // '왜' 칸 문구(체크인 기록이 없어요)를 되풀이하지 않는다
    expect(f.advice).not.toContain("체크인 기록이 없어요");
  });

  it("늦는다고 알렸거나 모임 무렵 말했으면 참석 정정 쪽, 시각과 말을 보인다", () => {
    const f = noShowFacts({ members: team(4), userId: "me", startsAt: START, lateAt: "2026-10-23T10:20:00Z", lastChat: { at: "2026-10-23T10:50:00Z", body: "거의 다 왔어요  죄송해요!" } });
    expect(f.late).toBe("'늦을 것 같아요' 남김 · 저녁 7:20 (시작 10분 전)");
    expect(f.chat).toBe("단체방 마지막 말 저녁 7:50 (시작 20분 뒤) · \"거의 다 왔어요 죄송해요!\"");
    expect(f.lean).toBe("attended");
    expect(f.advice).toBe("늦는다고 미리 알렸어요. 모임 무렵 단체방에서 말했어요. 왔을 가능성이 높으니 맞으면 '참석으로 정정'을 눌러요. 정정하면 곧 후기 요청이 자동으로 가요.");
  });

  it("며칠 전 인사만 했으면 모임 무렵 대화로 치지 않는다", () => {
    const f = noShowFacts({ members: team(5), userId: "me", startsAt: START, lastChat: { at: "2026-10-21T03:00:00Z", body: "안녕하세요" } });
    expect(f.lean).toBe("noshow");
  });

  it("본인이 참석했다고 알렸으면 참석 정정 쪽", () => {
    expect(noShowFacts({ members: team(5), userId: "me", startsAt: START, claimed: true }).lean).toBe("attended");
  });

  it("테이블 전원이 체크인을 안 했으면 먼저 확인", () => {
    const f = noShowFacts({ members: team(0), userId: "me", startsAt: START, lateAt: "2026-10-23T10:20:00Z" });
    expect(f.checkin).toBe("같은 테이블 6명 중 0명 체크인");
    expect(f.lean).toBe("check");
  });

  it("긴 말은 40자에서 줄인다", () => {
    const f = noShowFacts({ members: team(5), userId: "me", startsAt: START, lastChat: { at: START, body: "가".repeat(60) } });
    expect(f.chat).toContain(`"${"가".repeat(40)}…"`);
  });
});
