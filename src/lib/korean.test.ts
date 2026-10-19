import { describe, expect, it } from "vitest";
import { hasBatchim, iyeyo } from "./korean";

describe("받침·이에요/예요", () => {
  it("한글·영문·숫자 끝 글자를 읽는 소리로 본다", () => {
    expect(iyeyo("서연")).toBe("서연이에요");
    expect(iyeyo("지우")).toBe("지우예요");
    expect(iyeyo("우연한식탁 B5FA")).toBe("우연한식탁 B5FA예요");
    expect(iyeyo("우연한식탁 07FD")).toBe("우연한식탁 07FD예요");
    expect(hasBatchim("ABCM")).toBe(true);
    expect(hasBatchim("F961")).toBe(true);
    expect(hasBatchim("C5E2")).toBe(false);
    expect(hasBatchim("")).toBe(false);
  });
});
