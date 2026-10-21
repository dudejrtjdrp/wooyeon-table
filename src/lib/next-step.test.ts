import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

// 11월 13일(금) 저녁 7:30 모임, 결과는 11월 10일(화) 밤 12시
const base = {
  application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", attendance_status: null, resolution: null,
  matchAt: "2026-11-11T00:00:00+09:00", applyDeadline: "2026-11-11T00:00:00+09:00",
  startsAt: "2026-11-13T19:30:00+09:00", endsAt: "2026-11-13T22:00:00+09:00",
};
const at = (s: string) => new Date(s);
const line = (x: ReturnType<typeof nextStep>) => `${x?.next?.when ?? ""}${x?.next?.text ?? ""}`;

describe("nextStep", () => {
  it("결제 대기: 결제 기한과 결제 뒤 결과 시각을 함께", () => {
    const s = nextStep({ ...base, payment_status: "PENDING" }, at("2026-11-09T12:00:00+09:00"));
    expect(line(s)).toContain("11월 10일(화) 밤 12시까지 결제해야");
    expect(s?.can).toContain("결제");
  });
  it("결제 전에 결과 시각이 지났으면 따로 안내하니 없다", () => {
    expect(nextStep({ ...base, payment_status: "PENDING" }, at("2026-11-11T01:00:00+09:00"))).toBeNull();
  });
  it("매칭 대기: 마감 시각에 한 번에 꾸리고, 인원이 차도 먼저 열리지 않으며, 식당·단체방이 함께 열린다", () => {
    const s = nextStep(base, at("2026-11-09T12:00:00+09:00"));
    expect(s?.next?.when).toBe("11월 10일(화) 밤 12시");
    expect(s?.next?.text).toMatch(/한 번에/);
    expect(s?.next?.text).toMatch(/먼저 찬다고 일찍 열리지 않아요/);
    expect(s?.next?.text).toMatch(/식당·주소와 단체방/);
    expect(s?.can).toMatch(/전액/);
  });
  it("회차 매칭이 이미 끝났는데 대기로 남았으면(운영팀 확인 중) 따로 약속하지 않는다", () => {
    expect(nextStep({ ...base, roundStatus: "matched" }, at("2026-11-09T12:00:00+09:00"))).toBeNull();
    expect(nextStep({ ...base, roundStatus: "open" }, at("2026-11-09T12:00:00+09:00"))).not.toBeNull();
  });
  it("결과 시각이 지났는데 아직 대기면 시각 없이 '정해지는 대로'", () => {
    const s = nextStep(base, at("2026-11-11T00:05:00+09:00"));
    expect(s?.next?.when).toBeNull();
  });
  it("재배치 중·매칭 실패·자리 기다리기", () => {
    expect(nextStep({ ...base, match_status: "REALLOCATING" }, at("2026-11-11T01:00:00+09:00"))?.next?.text).toMatch(/다른 테이블/);
    expect(nextStep({ ...base, match_status: "ALTERNATIVE_OFFERED" }, at("2026-11-11T01:00:00+09:00"))?.next?.text).toMatch(/3일/);
    expect(nextStep({ ...base, payment_status: "REFUND_AVAILABLE", match_status: "ALTERNATIVE_OFFERED" }, at("2026-11-11T01:00:00+09:00"))?.can).toMatch(/옮기면 다시 결제하지 않아요/);
    expect(nextStep({ ...base, match_status: "ALTERNATIVE_OFFERED", resolution: "wait" }, at("2026-11-11T01:00:00+09:00"))?.next?.text).toMatch(/자리가 나면/);
  });
  const ok = { ...base, match_status: "CONFIRMED", attendance_status: "SCHEDULED" };
  it("확정 뒤: 하루 전 안내 → 체크인 열림 → 시작(대화 주제) → 끝(어땠는지) 순서", () => {
    expect(line(nextStep(ok, at("2026-11-11T09:00:00+09:00")))).toBe("11월 12일(목) 저녁 7:30에 시간·장소·예약명을 알림과 단체방으로 한 번 더 보내 드려요.");
    expect(line(nextStep(ok, at("2026-11-12T20:00:00+09:00")))).toContain("11월 13일(금) 저녁 6:30부터 체크인");
    expect(line(nextStep(ok, at("2026-11-13T19:00:00+09:00")))).toContain("대화 주제");
    expect(line(nextStep(ok, at("2026-11-13T20:00:00+09:00")))).toContain("11월 13일(금) 저녁 10시에 모임이 끝나면");
    expect(nextStep(ok, at("2026-11-13T22:00:00+09:00"))).toBeNull();
  });
  it("확정 뒤 환불 마감 전후로 할 수 있는 일이 다르다", () => {
    // 마감 = 모임 주 화요일 밤 12시 (11월 10일)
    expect(nextStep(ok, at("2026-11-09T09:00:00+09:00"))?.can).toContain("11월 10일(화) 밤 12시까지는");
    expect(nextStep(ok, at("2026-11-11T09:00:00+09:00"))?.can).toContain("환불은 안 돼요");
  });
  it("체크인했으면 체크인하라고 하지 않는다", () => {
    expect(nextStep({ ...ok, attendance_status: "ATTENDED" }, at("2026-11-13T20:00:00+09:00"))?.can).not.toMatch(/체크인해 주세요/);
  });
  it("취소·환불·이동은 없다", () => {
    expect(nextStep({ ...base, application_status: "CANCELED" }, at("2026-11-09T09:00:00+09:00"))).toBeNull();
    expect(nextStep({ ...base, payment_status: "REFUNDED" }, at("2026-11-09T09:00:00+09:00"))).toBeNull();
    expect(nextStep({ ...base, match_status: "TRANSFERRED" }, at("2026-11-09T09:00:00+09:00"))).toBeNull();
  });
});
