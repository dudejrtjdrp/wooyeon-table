import { describe, expect, it } from "vitest";
import { adapterFor, deepLink } from "./reservations";

const req = { venueName: "을지로 골목부엌", venueAddress: "서울 중구 을지로3가", bookingUrl: null, reservedFor: "2026-10-23T10:30:00Z", partySize: 5, name: "우연한식탁 AB12" };

describe("식당 예약 어댑터", () => {
  it("네이버·캐치테이블은 예약번호를 돌려주고, 같은 요청이면 같은 번호다(두 번 보내도 한 건)", async () => {
    const a = await adapterFor("naver").book({ ...req, channel: "naver" });
    const b = await adapterFor("naver").book({ ...req, channel: "naver" });
    expect(a.ok && a.externalRef.startsWith("NV-")).toBe(true);
    expect(a).toEqual(b);
    const c = await adapterFor("catchtable").book({ ...req, channel: "catchtable" });
    expect(c.ok && c.externalRef.startsWith("CT-")).toBe(true);
  });
  it("전화 예약 식당은 자동으로 못 해서 실패로 돌려준다(운영자 몫)", async () => {
    const r = await adapterFor("phone").book({ ...req, channel: "phone" });
    expect(r.ok).toBe(false);
  });
  it("예약 링크는 등록된 주소가 있으면 그걸 쓰고, 없으면 채널에서 식당을 찾는 주소", () => {
    expect(deepLink("naver", "가게", "서울 (가상)", "https://booking.naver.com/x")).toBe("https://booking.naver.com/x");
    expect(deepLink("naver", "가게", "서울 중구", null)).toContain("map.naver.com");
    expect(deepLink("catchtable", "가게", "서울", null)).toContain("catchtable");
    expect(deepLink("phone", "가게", "서울", null)).toBeNull();
  });
});
