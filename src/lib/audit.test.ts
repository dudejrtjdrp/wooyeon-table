import { describe, expect, it } from "vitest";
import { auditChange, auditKindOf, auditQuery, auditSearch, auditTarget, cleanQuery, csvCell, describeFilter, maskText, parseAuditFilter, parseWeightsValue, weightsValue } from "./audit";

const ADMIN = "11111111-2222-4333-8444-555555555555";

describe("변경 이력 거르기 (A5·D5)", () => {
  it("주소 값을 검사해서 받고, 모르는 값은 버린다", () => {
    const f = parseAuditFilter({ kind: "template", actor: `admin:${ADMIN}`, from: "2026-10-01", to: "2026-10-19", q: " 가중치 ", page: "3" });
    expect(f).toEqual({ kind: "template", actor: `admin:${ADMIN}`, from: "2026-10-01", to: "2026-10-19", q: "가중치", page: 3 });
    const bad = parseAuditFilter({ kind: "drop table", actor: "admin:x", from: "어제", page: "-2" });
    expect(bad).toEqual({ kind: undefined, actor: undefined, from: undefined, to: undefined, q: undefined, page: 1 });
  });

  it("기간이 거꾸로면 바꿔 잡고, 서울 날짜 하루 전체를 포함한다", () => {
    const f = parseAuditFilter({ from: "2026-10-19", to: "2026-10-01" });
    expect([f.from, f.to]).toEqual(["2026-10-01", "2026-10-19"]);
    const q = auditQuery(f);
    expect(q.since).toBe("2026-09-30T15:00:00.000Z");
    expect(q.until).toBe("2026-10-19T15:00:00.000Z");
  });

  it("대상 종류는 entity_type 묶음으로, 템플릿과 설정은 field로 나눈다", () => {
    expect(auditQuery({ kind: "template", page: 1 })).toMatchObject({ types: ["setting"], fieldLike: "template:%" });
    expect(auditQuery({ kind: "setting", page: 1 })).toMatchObject({ fieldNotLike: "template:%" });
    expect(auditQuery({ kind: "table", page: 1 }).types).toEqual(["dining_table", "chat_room"]);
    expect(auditKindOf("setting", "template:confirmed")).toBe("template");
    expect(auditKindOf("setting", "matching.weights")).toBe("setting");
    expect(auditKindOf("venue", "edit")).toBe("venue");
    expect(auditKindOf("??", "x")).toBe("other");
  });

  it("누가: 운영자 전체·자동·참가자·운영자 한 명", () => {
    expect(auditQuery({ actor: "admin", page: 1 }).actorLike).toBe("admin:%");
    expect(auditQuery({ actor: "user", page: 1 }).actorLike).toBe("user:%");
    expect(auditQuery({ actor: "system", page: 1 }).actorEq).toBe("system");
    expect(auditQuery({ actor: `admin:${ADMIN}`, page: 1 }).actorEq).toBe(`admin:${ADMIN}`);
  });

  it("한 쪽 50개씩 넘기고, 같은 거르기로 주소를 다시 만든다", () => {
    expect(auditQuery({ page: 3 })).toMatchObject({ offset: 100, limit: 50 });
    const f = parseAuditFilter({ kind: "venue", q: "을지로" });
    expect(auditSearch(f)).toBe("?kind=venue&q=%EC%9D%84%EC%A7%80%EB%A1%9C");
    expect(auditSearch(f, 2)).toContain("page=2");
    expect(auditSearch({ page: 1 })).toBe("");
  });

  it("검색어에서 쿼리 문법을 깨는 글자를 뺀다", () => {
    expect(cleanQuery("a,b)*%(c")).toBe("a b c");
    expect(cleanQuery("   ")).toBeUndefined();
    expect(cleanQuery("가".repeat(80))!.length).toBe(50);
  });

  it("CSV 이력에 남길 거르기 설명", () => {
    expect(describeFilter({ page: 1 })).toBe("거르기 없음");
    expect(describeFilter({ kind: "setting", actor: `admin:${ADMIN}`, from: "2026-10-01", q: "기준", page: 1 }, new Map([[ADMIN, "이지은"]])))
      .toBe("대상 설정 · 누가 운영자 이지은 · 기간 2026-10-01~오늘 · 검색 '기준'");
  });
});

describe("바뀐 내용 한 줄", () => {
  const before = weightsValue({ age: 25, gender: 22, mbti: 18, interests: 15, wanted: 12, fresh: 8 }, 50);
  const after = weightsValue({ age: 30, gender: 22, mbti: 18, interests: 10, wanted: 12, fresh: 8 }, 55);

  it("매칭 기준은 바뀐 칸만 이전 → 새 값으로", () => {
    expect(auditChange({ entity_type: "setting", field: "matching.weights", from_value: before, to_value: after }))
      .toBe("매칭 기준 연령대 25 → 30 · 관심사 15 → 10 · 최소 점수 50 → 55");
  });

  it("예전 줄(이전 값 없음)은 지금 값 전체를 보여 준다", () => {
    expect(auditChange({ entity_type: "setting", field: "matching.weights", from_value: null, to_value: before }))
      .toBe("매칭 기준 연령대 25 · 성비 22 · MBTI 18 · 관심사 15 · 희망 성향 12 · 새로운 사람 8 · 최소 점수 50");
  });

  it("되돌릴 값은 가중치 6개와 최소 점수가 모두 0~100일 때만 받는다", () => {
    expect(parseWeightsValue(after)).toEqual({ weights: { age: 30, gender: 22, mbti: 18, interests: 10, wanted: 12, fresh: 8 }, min: 55 });
    expect(parseWeightsValue('{"age":1}')).toBeNull();
    expect(parseWeightsValue("updated")).toBeNull();
    expect(parseWeightsValue(after.replace('"min":55', '"min":500'))).toBeNull();
    // 키 순서가 달라도 같은 값이면 같은 글자
    expect(weightsValue({ fresh: 8, age: 25, gender: 22, mbti: 18, interests: 15, wanted: 12 }, 50)).toBe(before);
  });

  it("자동 메시지 문구는 제목·본문 이전 → 새 값, 비어 있으면 기본 문구", () => {
    const label = (k: string) => (k === "confirmed" ? "테이블 확정" : undefined);
    expect(auditChange({ entity_type: "setting", field: "template:confirmed", from_value: '{"title":"","body":""}', to_value: '{"title":"자리가 정해졌어요","body":""}' }, label))
      .toBe("자동 메시지 '테이블 확정' 제목 기본 문구 → '자리가 정해졌어요'");
    expect(auditChange({ entity_type: "setting", field: "template:confirmed", from_value: null, to_value: "updated" }, label)).toBe("자동 메시지 '테이블 확정' 수정");
  });

  it("식당 고침은 칸별로 맞춰 보여 준다", () => {
    expect(auditChange({ entity_type: "venue", field: "edit", from_value: "이름=A식당; 좌석=6", to_value: "이름=B식당; 좌석=6" })).toBe("고침 이름 A식당 → B식당 · 좌석 6 → 6");
  });

  it("상태값과 운영자 계정 줄은 한국어로", () => {
    expect(auditChange({ entity_type: "application", field: "payment_status", from_value: "PAID", to_value: "REFUNDED" })).toBe("결제 결제 완료 → 환불 완료");
    expect(auditChange({ entity_type: "user", field: "admin_active", from_value: "true", to_value: "false" })).toBe("계정 사용 켬 → 끔");
    expect(auditChange({ entity_type: "user", field: "password_reset", from_value: null, to_value: "reset" })).toBe("비밀번호 초기화");
    expect(auditChange({ entity_type: "user", field: "admin_account", from_value: null, to_value: "created" })).toBe("운영자 계정 등록");
    expect(auditChange({ entity_type: "admin_export", field: "csv_export", from_value: null, to_value: "120" })).toBe("CSV 내려받기 120건");
  });
});

describe("대상 이름과 링크", () => {
  it("상세 화면이 있는 대상만 링크를 건다", () => {
    expect(auditTarget({ entity_type: "application", entity_id: "a1aaaaaa", field: "match_status" }, { apps: new Map([["a1aaaaaa", { name: "김우연", round: "10월 4주차" }]]) }))
      .toEqual({ kind: "신청", name: "김우연 · 10월 4주차", href: "/admin/applicants/a1aaaaaa" });
    expect(auditTarget({ entity_type: "venue", entity_id: "v1", field: "edit" }, { venues: new Map([["v1", "을지로 노포"]]) }).href).toBe("/admin/venues/v1");
    expect(auditTarget({ entity_type: "chat_room", entity_id: "r1", field: "system_message" }, { rooms: new Map([["r1", "t1"]]) }).href).toBe("/admin/tables/t1");
    expect(auditTarget({ entity_type: "pass", entity_id: "p1234567", field: "expires_at" }).href).toBeUndefined();
  });

  it("운영자 계정 줄은 계정 관리로, 참가자는 최근 신청 상세로", () => {
    expect(auditTarget({ entity_type: "user", entity_id: "u1", field: "admin_active" }).href).toBe("/admin/settings#accounts");
    const users = new Map([["u2", { name: "박식탁", role: "user", appId: "app9" }]]);
    expect(auditTarget({ entity_type: "user", entity_id: "u2", field: "account_status" }, { users })).toEqual({ kind: "참가자 계정", name: "박식탁", href: "/admin/applicants/app9" });
  });

  it("설정은 어느 설정인지 보이게", () => {
    expect(auditTarget({ entity_type: "setting", entity_id: ADMIN, field: "matching.weights" })).toEqual({ kind: "설정", name: "매칭 기준", href: "/admin/settings" });
    expect(auditTarget({ entity_type: "setting", entity_id: ADMIN, field: "template:reminder" }, { templateLabel: () => "하루 전 안내" }).name).toBe("하루 전 안내");
  });
});

describe("개인정보·CSV", () => {
  it("휴대폰 번호와 이메일은 가린다", () => {
    expect(maskText("010-1234-5678로 연락")).toBe("010-****-5678로 연락");
    expect(maskText("01012345678")).toBe("010-****-5678");
    expect(maskText("dudejrtjdrp@kakao.com")).toBe("du***@kakao.com");
    expect(maskText("연령대 25 → 30")).toBe("연령대 25 → 30");
  });

  it("CSV 칸은 따옴표를 풀고, 수식으로 읽히지 않게 막는다", () => {
    expect(csvCell('그는 "안녕"')).toBe('"그는 ""안녕"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell(null)).toBe('""');
  });
});
