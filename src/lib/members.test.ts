import { describe, expect, it } from "vitest";
import { adminBack, escapeLike, maskPhone, parseMemberQuery } from "./members";

describe("회원 찾기 검색어 parseMemberQuery", () => {
  it("숫자 4자리는 연락처 뒤 4자리", () => {
    expect(parseMemberQuery("5678")).toEqual({ kind: "phone4", digits: "5678" });
  });
  it("하이픈 섞인 전체 번호", () => {
    expect(parseMemberQuery("010-1234-5678")).toEqual({ kind: "phone", digits: "01012345678" });
  });
  it("이름·로그인 ID는 글자로", () => {
    expect(parseMemberQuery(" 김하늘 ")).toEqual({ kind: "text", text: "김하늘" });
    expect(parseMemberQuery("test-01")).toEqual({ kind: "text", text: "test-01" });
  });
  it("비었거나 한 글자는 찾지 않는다", () => {
    expect(parseMemberQuery("")).toEqual({ kind: "empty" });
    expect(parseMemberQuery("김")).toEqual({ kind: "empty" });
  });
});

describe("maskPhone", () => {
  it("가운데를 가린다", () => {
    expect(maskPhone("01012345678")).toBe("010-****-5678");
    expect(maskPhone("0101235678")).toBe("010-****-5678");
  });
  it("모양이 다르면 통째로 가린다", () => {
    expect(maskPhone("12345")).toBe("****");
    expect(maskPhone(null)).toBe("-");
  });
});

describe("escapeLike·adminBack", () => {
  it("와일드카드를 글자로", () => {
    expect(escapeLike("50%_a\\")).toBe("50\\%\\_a\\\\");
  });
  it("어드민 안쪽 경로만 돌아갈 곳으로", () => {
    expect(adminBack("/admin/members/1", "/admin")).toBe("/admin/members/1");
    expect(adminBack("https://evil.com", "/admin")).toBe("/admin");
    expect(adminBack("/admin\\x", "/admin")).toBe("/admin");
  });
});
