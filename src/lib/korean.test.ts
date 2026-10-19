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

describe("으로/로, 은/는", () => {
  it("받침과 ㄹ 받침을 본다", async () => {
    const { euro, eunNeun } = await import("./korean");
    expect(euro("고르신 다른 일정")).toBe("고르신 다른 일정으로");
    expect(euro("가까운 동네(홍대·합정·연남)")).toBe("가까운 동네(홍대·합정·연남)으로");
    expect(euro("강남·역삼·선릉")).toBe("강남·역삼·선릉으로");
    expect(euro("서울")).toBe("서울로");
    expect(euro("다른 테이블")).toBe("다른 테이블로");
    expect(eunNeun("홍대·합정·연남")).toBe("홍대·합정·연남은");
    expect(eunNeun("잠실·송파")).toBe("잠실·송파는");
  });
});
