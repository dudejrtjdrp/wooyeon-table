import { describe, expect, it } from "vitest";
import { FEEDBACK_HASH, MESSAGES_HASH, feedbackLegacyTarget, hashTarget, messagesLegacyTarget } from "./legacy-links";

describe("자동 메시지 예전 주소", () => {
  it("공지 대상 값이 있으면 공지 탭으로, 대상 값과 결과 안내는 그대로", () => {
    expect(messagesLegacyTarget({ ns: "member", nm: "abc", m: "보냈어요", q: "김" })).toBe("/admin/messages/notice?ns=member&nm=abc&m=%EB%B3%B4%EB%83%88%EC%96%B4%EC%9A%94");
    expect(messagesLegacyTarget({ tab: "notice" })).toBe("/admin/messages/notice");
  });
  it("tab=templates면 문구 템플릿으로", () => {
    expect(messagesLegacyTarget({ tab: "templates" })).toBe("/admin/messages/templates");
    expect(messagesLegacyTarget({ tab: ["tpl"], m: "저장했어요" })).toBe(`/admin/messages/templates?m=${encodeURIComponent("저장했어요")}`);
  });
  it("발송 이력 거르기 주소는 그대로 둔다", () => {
    expect(messagesLegacyTarget({ st: "failed", page: "2" })).toBeNull();
    expect(messagesLegacyTarget({})).toBeNull();
  });
});

describe("피드백·안전 예전 주소", () => {
  it("?u= 나 ?pq= 는 사람별 보기로", () => {
    expect(feedbackLegacyTarget({ u: "id1", r: "r1" })).toBe("/admin/feedback/person?u=id1&r=r1");
    expect(feedbackLegacyTarget({ pq: "김" })).toBe(`/admin/feedback/person?pq=${encodeURIComponent("김")}`);
  });
  it("tab=reports 는 신고 탭으로, 회차만 고른 주소는 그대로", () => {
    expect(feedbackLegacyTarget({ tab: "reports" })).toBe("/admin/feedback/reports");
    expect(feedbackLegacyTarget({ r: "r1" })).toBeNull();
  });
});

describe("#해시 링크 옮기기", () => {
  it("예전 해시는 맞는 탭으로, 주소 값은 그대로 넘긴다", () => {
    expect(hashTarget("/admin/messages", "#templates", "", MESSAGES_HASH)).toBe("/admin/messages/templates");
    expect(hashTarget("/admin/messages", "#notice", "?ns=member&nm=x", MESSAGES_HASH)).toBe("/admin/messages/notice?ns=member&nm=x");
    expect(hashTarget("/admin/feedback", "#reports", "?r=1", FEEDBACK_HASH)).toBe("/admin/feedback/reports?r=1");
  });
  it("'#tpl-키'처럼 접두어가 맞으면 옮기고 해시를 남긴다", () => {
    expect(hashTarget("/admin/messages", "#tpl-confirmed", "", MESSAGES_HASH)).toBe("/admin/messages/templates#tpl-confirmed");
  });
  it("모르는 해시, 빈 해시, 이미 그 탭이면 옮기지 않는다", () => {
    expect(hashTarget("/admin/messages", "#log", "", MESSAGES_HASH)).toBeNull();
    expect(hashTarget("/admin/messages", "", "", MESSAGES_HASH)).toBeNull();
    expect(hashTarget("/admin/messages", "#tplx", "", MESSAGES_HASH)).toBeNull();
    expect(hashTarget("/admin/messages/templates", "#tpl-confirmed", "", MESSAGES_HASH)).toBeNull();
  });
});
