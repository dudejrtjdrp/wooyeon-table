import { describe, expect, it } from "vitest";
import { cleanNotice, isFailedNotice, logRange, logSearch, noticeKey, noticeLink, noticeRecipients, noticeSendCheck, pageCount, parseLogFilter, parseScope } from "./notice-rules";

const TPL = new Set(["confirmed", "announcement"]);

describe("발송 이력 거르기", () => {
  it("모르는 템플릿·상태와 잘못된 날짜는 버리고, 날짜가 거꾸로면 바꾼다", () => {
    const f = parseLogFilter({ q: " 김하늘 ", tpl: "nope", st: "weird", from: "2026-10-20", to: "2026-10-01", page: "3" }, TPL);
    expect(f).toEqual({ q: "김하늘", tpl: undefined, st: undefined, from: "2026-10-01", to: "2026-10-20", page: 3 });
    expect(parseLogFilter({ tpl: "confirmed", st: "failed", from: "2026-13-40" }, TPL)).toMatchObject({ tpl: "confirmed", st: "failed", from: undefined, page: 1 });
  });

  it("검색어에서 조회 문법을 깨는 글자를 뺀다", () => {
    expect(parseLogFilter({ q: "a,b(c)%" }, TPL).q).toBe("a b c");
  });

  it("거르기 조건을 유지한 채 쪽만 바꾼다", () => {
    const f = parseLogFilter({ tpl: "confirmed", st: "sent", page: "2" }, TPL);
    expect(logSearch(f)).toBe("?tpl=confirmed&st=sent&page=2");
    expect(logSearch(f, 1)).toBe("?tpl=confirmed&st=sent");
    expect(logSearch({ page: 1 })).toBe("");
  });

  it("서울 날짜 하루를 통째로 포함한다", () => {
    expect(logRange({ from: "2026-10-19", to: "2026-10-19" })).toEqual({ since: "2026-10-18T15:00:00.000Z", until: "2026-10-19T15:00:00.000Z" });
    expect(pageCount(0)).toBe(1);
    expect(pageCount(31)).toBe(2);
  });

  it("알림함에 못 넣은 것과 푸시가 안 나간 것만 실패로 본다", () => {
    expect(isFailedNotice({ status: "failed", last_error: "x" })).toBe(true);
    expect(isFailedNotice({ status: "sent", last_error: "푸시 실패: 410" })).toBe(true);
    expect(isFailedNotice({ status: "sent", last_error: null })).toBe(false);
    expect(isFailedNotice({ status: "pending", last_error: "일시 오류" })).toBe(false);
  });
});

describe("운영자 공지", () => {
  it("대상 종류는 셋 중 하나만", () => {
    expect(parseScope("round")).toBe("round");
    expect(parseScope("all")).toBeNull();
  });

  it("문구는 한 줄로 만들고 길이를 지킨다", () => {
    expect(cleanNotice(" 장소 안내 ", "입구가\n바뀌었어요")).toEqual({ ok: true, title: "장소 안내", body: "입구가 바뀌었어요" });
    expect(cleanNotice("a", "내용이에요").ok).toBe(false);
    expect(cleanNotice("제목", "짧은 글").ok).toBe(true);
    expect(cleanNotice("제목", "짧음").ok).toBe(false);
    expect(cleanNotice("제목", "가".repeat(61)).ok).toBe(false);
    expect(cleanNotice("가".repeat(31), "내용이에요").ok).toBe(false);
  });

  it("회차 공지는 신청서를 낸 사람만, 한 사람은 한 번만, 탈퇴한 사람은 뺀다", () => {
    const rows = [
      { user_id: "a", application_status: "SUBMITTED" },
      { user_id: "a", application_status: "SUBMITTED" },
      { user_id: "b", application_status: "DRAFT" },
      { user_id: "c", application_status: "CANCELED" },
      { user_id: "d", application_status: "SUBMITTED", deleted_at: "2026-10-01T00:00:00Z" },
    ];
    expect(noticeRecipients("round", rows)).toEqual(["a"]);
  });

  it("테이블 공지는 지금 확정된 사람만 (빠졌거나 참석 취소한 사람 빼고)", () => {
    const rows = [
      { user_id: "a", match_status: "CONFIRMED", application_status: "SUBMITTED", attendance_status: "SCHEDULED" },
      { user_id: "b", match_status: "CONFIRMED", application_status: "SUBMITTED", attendance_status: "CANCELED_EARLY" },
      { user_id: "c", match_status: "REALLOCATING", application_status: "SUBMITTED", attendance_status: null },
    ];
    expect(noticeRecipients("table", rows)).toEqual(["a"]);
    expect(noticeRecipients("member", [{ user_id: "z" }])).toEqual(["z"]);
  });

  it("같은 대상·같은 문구는 같은 키라 두 번 나가지 않고, 문구가 다르면 새로 나간다", () => {
    const k1 = noticeKey("table", "t1", "제목", "내용", "u1");
    expect(noticeKey("table", "t1", "제목", "내용", "u1")).toBe(k1);
    expect(noticeKey("table", "t1", "제목", "내용!", "u1")).not.toBe(k1);
    expect(noticeKey("table", "t1", "제목", "내용", "u2")).not.toBe(k1);
    expect(k1.startsWith("announce:table:t1:")).toBe(true);
  });

  it("보낼 때 받는 사람 수가 화면과 다르면 멈춘다", () => {
    expect(noticeSendCheck("2", ["a", "b"])).toEqual({ ok: true });
    expect(noticeSendCheck("3", ["a", "b"]).ok).toBe(false);
    expect(noticeSendCheck("0", []).ok).toBe(false);
    expect(noticeLink("table", "t1")).toBe("/tables/t1");
    expect(noticeLink("round", "r1")).toBeUndefined();
  });
});
