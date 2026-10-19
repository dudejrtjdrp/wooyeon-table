import { describe, expect, it } from "vitest";
import { type ApplicantLike, applicantDbFilter, applicantFiltered, applicantMatches, applicantSearch, describeApplicantFilter, parseApplicantFilter } from "./applicant-filter";

const R = "11111111-2222-4333-8444-555555555555";
const base: ApplicantLike = {
  payment_status: "PAID", match_status: "CONFIRMED", attendance_status: "SCHEDULED", application_status: "SUBMITTED", resolution: null,
  users: { name: "김하나", login_id: "hana01" }, application_slots: [{ slots: { region: "홍대·합정·연남" } }, { slots: { region: "잠실·송파" } }],
};
const fresh = { attended: 0, noShows: 0, reports: 0 };

describe("신청자 목록 거르기 (PRD 11장)", () => {
  it("주소 값을 검사해서 받고, 모르는 값은 버린다", () => {
    const f = parseApplicantFilter({ r: R, s: "CHOOSING", pay: "PAID", att: "NONE", region: " 잠실·송파 ", hist: "noshow", q: " 하나 " });
    expect(f).toEqual({ r: R, s: "CHOOSING", pay: "PAID", att: "NONE", region: "잠실·송파", hist: "noshow", q: "하나" });
    const bad = parseApplicantFilter({ r: "x", s: "constructor", pay: "toString", att: "late", hist: "vip", q: "  " });
    expect(bad).toEqual({ r: undefined, s: undefined, pay: undefined, att: undefined, region: undefined, hist: undefined, q: undefined });
    expect(applicantFiltered({ r: R })).toBe(false);
    expect(applicantFiltered({ r: R, pay: "PAID" })).toBe(true);
  });

  it("주소로 바꿨다가 다시 읽어도 같다 (공유·새로고침·CSV)", () => {
    const f = parseApplicantFilter({ r: R, pay: "REFUNDED", region: "을지로·종로·광화문", hist: "report" });
    const s = applicantSearch(f);
    expect(s.startsWith(`?r=${R}&pay=REFUNDED&region=`)).toBe(true);
    expect(parseApplicantFilter(Object.fromEntries(new URLSearchParams(s)))).toEqual(f);
    expect(applicantSearch({})).toBe("");
  });

  it("DB 조건: 대안 미선택·신청 취소·참석 없음", () => {
    expect(applicantDbFilter({ s: "CHOOSING" })).toEqual({ matchEq: "ALTERNATIVE_OFFERED" });
    expect(applicantDbFilter({ s: "CANCELED", att: "NONE" })).toEqual({ appStatusEq: "CANCELED", attNull: true });
    expect(applicantDbFilter({ s: "CONFIRMED", pay: "PAID", att: "NO_SHOW" })).toEqual({ matchEq: "CONFIRMED", payEq: "PAID", attEq: "NO_SHOW" });
  });

  it("상태·동네·검색으로 거른다", () => {
    expect(applicantMatches(base, {}, fresh)).toBe(true);
    expect(applicantMatches(base, { pay: "REFUNDED" }, fresh)).toBe(false);
    expect(applicantMatches(base, { att: "NONE" }, fresh)).toBe(false);
    expect(applicantMatches({ ...base, attendance_status: null }, { att: "NONE" }, fresh)).toBe(true);
    expect(applicantMatches(base, { region: "잠실·송파" }, fresh)).toBe(true);
    expect(applicantMatches(base, { region: "강남·역삼·선릉" }, fresh)).toBe(false);
    expect(applicantMatches(base, { q: "hana" }, fresh)).toBe(true);
    expect(applicantMatches(base, { q: "둘" }, fresh)).toBe(false);
    expect(applicantMatches({ ...base, application_status: "CANCELED" }, { s: "CANCELED" }, fresh)).toBe(true);
  });

  it("대안 미선택은 자리 기다리기를 고른 사람을 뺀다 (대시보드와 같은 기준)", () => {
    const alt = { ...base, match_status: "ALTERNATIVE_OFFERED" };
    expect(applicantMatches(alt, { s: "CHOOSING" }, fresh)).toBe(true);
    expect(applicantMatches({ ...alt, resolution: "wait" }, { s: "CHOOSING" }, fresh)).toBe(false);
    expect(applicantMatches({ ...alt, resolution: "wait" }, { s: "ALTERNATIVE_OFFERED" }, fresh)).toBe(true);
  });

  it("이전 참석·노쇼·신고 이력으로 거른다", () => {
    const back = { attended: 2, noShows: 0, reports: 0 };
    const noshow = { attended: 0, noShows: 1, reports: 0 };
    const reported = { attended: 1, noShows: 0, reports: 2 };
    expect(applicantMatches(base, { hist: "first" }, fresh)).toBe(true);
    expect(applicantMatches(base, { hist: "first" }, noshow)).toBe(false);
    expect(applicantMatches(base, { hist: "returning" }, back)).toBe(true);
    expect(applicantMatches(base, { hist: "returning" }, fresh)).toBe(false);
    expect(applicantMatches(base, { hist: "noshow" }, noshow)).toBe(true);
    expect(applicantMatches(base, { hist: "noshow" }, back)).toBe(false);
    expect(applicantMatches(base, { hist: "report" }, reported)).toBe(true);
    expect(applicantMatches(base, { hist: "report" }, back)).toBe(false);
  });

  it("내려받기 설명을 사람 말로", () => {
    expect(describeApplicantFilter({})).toBe("거르기 없음");
    expect(describeApplicantFilter({ r: R, s: "CHOOSING", pay: "PAID", att: "NONE", region: "잠실·송파", hist: "noshow", q: "김" }, "10월 4주")).toBe(
      "회차 10월 4주 · 매칭 다른 방법 아직 안 고름 · 결제 결제 완료 · 참석 아직 없음 · 동네 잠실·송파 · 전에 노쇼 있음 · 검색 '김'",
    );
  });
});
