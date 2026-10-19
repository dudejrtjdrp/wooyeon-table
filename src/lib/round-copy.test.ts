import { describe, expect, it } from "vitest";
import { copyRoundDraft, copyRoundHref, nextWeekTitle, slotClashes } from "./round-copy";

const slot = (region: string, start: string, max = 4, minutes = 150) => ({ region, starts_at: start, ends_at: new Date(Date.parse(start) + minutes * 60_000).toISOString(), max_tables: max });
// 10월 23일(금)·24일(토) 저녁 7:30 (서울)
const SRC = { title: "10월 넷째 주 저녁", slots: [slot("홍대", "2026-10-23T10:30:00Z"), slot("잠실", "2026-10-23T10:30:00Z", 6), slot("홍대", "2026-10-24T10:30:00Z")] };
const MON = new Date("2026-10-19T00:00:00Z"); // 10월 19일(월) 오전 9시

describe("회차 복제 값", () => {
  it("겹치는 회차가 없으면 같은 요일 다음 주로 날짜를, 시각·진행 시간·동네·최대 테이블을 그대로 채운다", () => {
    const d = copyRoundDraft(SRC, MON);
    expect(d.dates).toEqual(["2026-10-30", "2026-10-31"]);
    expect(d.time).toBe("19:30");
    expect(d.duration).toBe("150");
    expect(d.regions).toEqual(["홍대", "잠실"]);
    expect(d.max_tables).toBe("6");
    expect(d.title).toBe("10월 다섯째 주 저녁");
    expect(d.from).toBe("10월 넷째 주 저녁");
    // 마감·매칭은 비워 둬서 새 날짜 기준 운영 규칙대로 잡힌다
    expect(d.deadline).toBeUndefined();
    expect(d.match_at).toBeUndefined();
  });
  it("다음 주 마감(화요일 밤 12시)이 이미 지났으면 한 주 더 미룬다", () => {
    const d = copyRoundDraft(SRC, new Date("2026-10-27T16:00:00Z")); // 10월 28일(수) 새벽 1시
    expect(d.dates).toEqual(["2026-11-06", "2026-11-07"]);
    expect(d.title).toBe("11월 첫째 주 저녁");
  });
  it("오래된 회차도 같은 요일로, 마감이 남은 가장 가까운 주를 고른다", () => {
    const d = copyRoundDraft({ title: "9월 첫째 주 저녁", slots: [slot("강남", "2026-09-04T10:00:00Z")] }, MON);
    expect(d.dates).toEqual(["2026-10-23"]);
    expect(new Date("2026-10-23T00:00:00Z").getUTCDay()).toBe(5); // 금요일 그대로
    expect(d.time).toBe("19:00");
    expect(d.title).toBe("10월 넷째 주 저녁");
  });
  it("이미 열린 회차와 같은 날짜·동네가 있는 주는 건너뛴다", () => {
    // 10월 30일 홍대가 이미 다른 회차에 있으면 그다음 주로
    const d = copyRoundDraft(SRC, MON, [{ region: "홍대", starts_at: "2026-10-30T10:30:00Z" }]);
    expect(d.dates).toEqual(["2026-11-06", "2026-11-07"]);
    // 다른 동네만 겹치면 그대로 다음 주
    expect(copyRoundDraft(SRC, MON, [{ region: "강남", starts_at: "2026-10-30T10:30:00Z" }]).dates).toEqual(["2026-10-30", "2026-10-31"]);
  });
  it("겹치는 일정을 서울 날짜 기준으로 찾는다", () => {
    // 10월 30일 밤 11시(서울)는 UTC로 30일 14시 → 같은 날
    expect(slotClashes([{ region: "홍대", date: "2026-10-30" }, { region: "잠실", date: "2026-10-30" }], [{ region: "홍대", starts_at: "2026-10-30T14:00:00Z" }])).toEqual([{ region: "홍대", date: "2026-10-30" }]);
    // 10월 31일 새벽 1시(서울)는 다른 날
    expect(slotClashes([{ region: "홍대", date: "2026-10-30" }], [{ region: "홍대", starts_at: "2026-10-30T16:00:00Z" }])).toEqual([]);
  });
  it("날짜 칸이 두 개라 앞의 두 날짜만 옮긴다", () => {
    const d = copyRoundDraft({ title: "주말", slots: [slot("홍대", "2026-10-23T10:30:00Z"), slot("홍대", "2026-10-24T10:30:00Z"), slot("홍대", "2026-10-25T10:30:00Z")] }, MON);
    expect(d.dates).toHaveLength(2);
  });
  it("주차 이름이 없으면 (복사)를 붙이고, 일정이 없으면 이름만 채운다", () => {
    expect(copyRoundDraft({ ...SRC, title: "가을 저녁" }, MON).title).toBe("가을 저녁 (복사)");
    expect(copyRoundDraft({ title: "빈 회차", slots: [] }, MON)).toEqual({ title: "빈 회차 (복사)", from: "빈 회차" });
  });
  it("주차 이름 바꾸기", () => {
    expect(nextWeekTitle("11월 3주차 모임", "2026-11-20")).toBe("11월 3주차 모임");
    expect(nextWeekTitle("11월 3주차 모임", "2026-11-27")).toBe("11월 4주차 모임");
    expect(nextWeekTitle("소셜 다이닝", "2026-11-27")).toBeNull();
  });
  it("새 회차 탭 주소에 f= 로 싣는다 (저장하지 않음)", () => {
    const href = copyRoundHref({ title: "가" });
    expect(href.startsWith("/admin/rounds?tab=new&f=")).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.split("f=")[1].split("#")[0]))).toEqual({ title: "가" });
  });
});
