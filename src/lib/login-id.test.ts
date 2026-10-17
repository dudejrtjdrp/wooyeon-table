import { describe, expect, it } from "vitest";
import { normalizeLoginId } from "./login-id";

describe("로그인 아이디 정리", () => {
  it("번호는 어떻게 쳐도 010… 숫자만", () => {
    for (const x of ["010-1234-5678", "010 1234 5678", "010.1234.5678", " 01012345678 ", "(010) 1234 5678", "+82 10-1234-5678", "821012345678", "+82 010-1234-5678"]) {
      expect(normalizeLoginId(x)).toBe("01012345678");
    }
  });
  it("admin·test- 아이디는 그대로 (앞뒤 공백만 뺌)", () => {
    expect(normalizeLoginId(" admin ")).toBe("admin");
    expect(normalizeLoginId("test-ab12-3")).toBe("test-ab12-3");
  });
});
