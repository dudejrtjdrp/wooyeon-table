import { describe, expect, it } from "vitest";
import { activeFullCount, adminLoginIdError, adminNameError, disableError, isAdminOff, levelError, resetError, tempPassword } from "./admin-accounts";

const me = { id: "me", name: "나", account_status: "active" };
const kim = { id: "kim", name: "김", account_status: "active" };
const lee = { id: "lee", name: "이", account_status: "banned" };
const demo = { id: "demo", name: "운영자", account_status: "active", is_demo: true };

describe("임시 비밀번호", () => {
  it("12자, 헷갈리는 글자 없이 영문과 숫자가 섞인다", () => {
    for (let i = 0; i < 200; i++) {
      const p = tempPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[0O1lIo]/);
    }
  });

  it("224 이상 바이트는 버리고 다시 뽑는다(치우침 방지)", () => {
    let call = 0;
    // 첫 묶음은 모두 버려지는 값, 다음 묶음은 'A'(0)와 '2'(48)
    const rand = (n: number) => {
      const first = call++ === 0;
      return Uint8Array.from({ length: n }, (_, i) => (first ? 250 : i % 2 ? 48 : 0));
    };
    expect(tempPassword(4, rand)).toBe("A2A2");
  });
});

describe("운영자 계정 입력 검사", () => {
  it("로그인 ID", () => {
    expect(adminLoginIdError("jieun.lee")).toBeNull();
    expect(adminLoginIdError("")).toBeTruthy();
    expect(adminLoginIdError("01012345678")).toContain("숫자만");
    expect(adminLoginIdError("Ab")).toBeTruthy();
    expect(adminLoginIdError("한글아이디")).toBeTruthy();
    expect(adminLoginIdError(".start")).toBeTruthy();
  });

  it("이름", () => {
    expect(adminNameError("이지은")).toBeNull();
    expect(adminNameError("이")).toBeTruthy();
    expect(adminNameError("가".repeat(21))).toBeTruthy();
  });
});

describe("끄기·등급·초기화 규칙", () => {
  const admins = [me, kim, lee, demo];

  it("꺼짐은 account_status=banned", () => {
    expect(isAdminOff("banned")).toBe(true);
    expect(isAdminOff("active")).toBe(false);
    expect(activeFullCount(admins, { kim: "viewer" })).toBe(2); // 나·시연 계정 (이는 꺼짐, 김은 조회 전용)
  });

  it("내 계정·시연 계정·이미 꺼진 계정은 끌 수 없다", () => {
    expect(disableError("me", me, admins, {})).toContain("내 계정");
    expect(disableError("me", demo, admins, {})).toContain("시연");
    expect(disableError("me", lee, admins, {})).toContain("이미");
    expect(disableError("me", undefined, admins, {})).toBeTruthy();
    expect(disableError("me", kim, admins, {})).toBeNull();
  });

  it("켜진 전체 권한 운영자가 한 명은 남아야 한다", () => {
    // 나는 조회 전용, 김만 전체 권한이면 김은 끌 수 없다
    expect(disableError("me", kim, [me, kim], { me: "viewer" })).toContain("한 명");
    expect(levelError("me", kim, [me, kim], { me: "viewer" }, "viewer")).toContain("한 명");
    expect(levelError("me", kim, [me, kim], {}, "viewer")).toBeNull();
  });

  it("내 등급은 내가 못 바꾼다", () => {
    expect(levelError("me", me, admins, {}, "viewer")).toContain("내 등급");
  });

  it("비밀번호 초기화는 다른 운영자 계정만, 시연 계정은 막는다", () => {
    expect(resetError("me", kim)).toBeNull();
    expect(resetError("me", me)).toContain("내 비밀번호");
    expect(resetError("me", demo)).toContain("시연");
    expect(resetError("me", undefined)).toBeTruthy();
  });
});
