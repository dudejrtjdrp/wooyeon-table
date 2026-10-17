import { describe, expect, it } from "vitest";
import { mapLinks, mapQuery } from "./maps";

describe("지도 바로 열기", () => {
  it("검색어는 식당 이름과 주소(괄호 설명 제외)", () => {
    expect(mapQuery("을지로 골목부엌", "서울 중구 을지로3가 (시연용 가상 주소)")).toBe("을지로 골목부엌 서울 중구 을지로3가");
  });
  it("웹 지도 주소와, 안드로이드에서 앱이 없으면 웹으로 넘어가는 intent 주소를 만든다", () => {
    const m = mapLinks("을지로 골목부엌", "서울 중구 을지로3가");
    const q = encodeURIComponent("을지로 골목부엌 서울 중구 을지로3가");
    expect(m.naver.web).toBe(`https://map.naver.com/p/search/${q}`);
    expect(m.kakao.web).toBe(`https://map.kakao.com/link/search/${q}`);
    expect(m.naver.android).toContain("scheme=nmap;package=com.nhn.android.nmap;");
    expect(m.naver.android).toContain(`S.browser_fallback_url=${encodeURIComponent(m.naver.web)}`);
    expect(m.kakao.android).toContain("scheme=kakaomap;package=net.daum.android.map;");
  });
  it("운영자가 넣은 지도 주소가 있으면 그 서비스는 그 주소를 쓴다", () => {
    const m = mapLinks("가게", "서울", "https://naver.me/abc");
    expect(m.naver.web).toBe("https://naver.me/abc");
    expect(m.kakao.web).toContain("map.kakao.com");
  });
});
