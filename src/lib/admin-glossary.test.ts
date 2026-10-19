import { describe, expect, it } from "vitest";
import { humanizeMatchLog, reasonText } from "./admin-glossary";

describe("humanizeMatchLog", () => {
  it("사유 코드를 한국어로 바꾼다", () => {
    expect(humanizeMatchLog("10월 23일 홍대 테이블 해제 (5명, 52점, age,excluded)")).toBe("10월 23일 홍대 테이블 해제 (5명, 52점, 나이 차 초과·차단·신고·비선호)");
    expect(humanizeMatchLog("재검증 실패로 해제: 강남 (slot)")).toBe("재검증 실패로 해제: 강남 (고르지 않은 일정)");
  });
  it("코드가 없는 줄은 그대로 둔다", () => {
    expect(humanizeMatchLog("대상 37명, 첫 배치 일정 6곳")).toBe("대상 37명, 첫 배치 일정 6곳");
  });
});

describe("reasonText", () => {
  it("내부 JSON 기록은 숨기거나 실패 이유만 보인다", () => {
    expect(reasonText('{"key":"notice:abc"}')).toBeNull();
    expect(reasonText('{"key":"notice:abc","error":"시간 초과"}')).toBe("실패 이유: 시간 초과");
    expect(reasonText('{"key":"remind:t1","error":"시간 초과","meta":{"type":"reminder"}}')).toBe("실패 이유: 시간 초과 (하루 전 안내)");
    expect(reasonText("모임 시작 시각")).toBe("모임 시작 시각");
    expect(reasonText(null)).toBeNull();
  });
});
