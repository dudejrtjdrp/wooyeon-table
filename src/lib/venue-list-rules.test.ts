import { describe, expect, it } from "vitest";
import { canDeleteVenue, filterVenues, parseVenueFilter, venueFiltered, venueSearch } from "./venue-list-rules";

const V = [
  { id: "1", name: "을지 한식당", address: "서울 중구 을지로 12", region: "을지로", active: true, photo_url: "/p/1", booking_channel: "naver" },
  { id: "2", name: "잠실 파스타", address: "서울 송파구 올림픽로 3", region: "잠실", active: false, photo_url: null, booking_channel: "catchtable" },
  { id: "3", name: "홍대 이자카야", address: "서울 마포구 와우산로 5", region: "홍대", active: true, photo_url: null, booking_channel: null },
];
const ids = (f: Parameters<typeof filterVenues>[1]) => filterVenues(V, f).map((v) => v.id);

describe("식당 목록 거르기 읽기", () => {
  it("알맞은 값만 남기고 모르는 값은 버린다", () => {
    expect(parseVenueFilter({ q: "  을지  한식 ", region: "을지로", state: "off", photo: "no", ch: "phone" })).toEqual({ q: "을지 한식", region: "을지로", state: "off", photo: "no", ch: "phone" });
    expect(parseVenueFilter({ state: "x", photo: "maybe", ch: "kakao" })).toEqual({ q: undefined, region: undefined, state: undefined, photo: undefined, ch: undefined });
    expect(parseVenueFilter({ ch: "none", q: ["첫", "둘"] })).toMatchObject({ ch: "none", q: "첫" });
  });
  it("주소 쿼리로 돌려 쓰고, 아무것도 없으면 빈 문자열", () => {
    expect(venueSearch({ q: "파스타", state: "on" })).toBe(`?q=${encodeURIComponent("파스타")}&state=on`);
    expect(venueSearch({})).toBe("");
    expect(venueFiltered({})).toBe(false);
    expect(venueFiltered({ photo: "yes" })).toBe(true);
  });
});

describe("식당 목록 거르기", () => {
  it("이름·주소를 띄어쓰기·대소문자 상관없이 찾는다", () => {
    expect(ids({ q: "을지한식" })).toEqual(["1"]);
    expect(ids({ q: "송파구" })).toEqual(["2"]);
    expect(ids({ q: "없는식당" })).toEqual([]);
  });
  it("동네·배정 상태·사진·예약 채널로 거른다", () => {
    expect(ids({ region: "홍대" })).toEqual(["3"]);
    expect(ids({ state: "off" })).toEqual(["2"]);
    expect(ids({ state: "on", photo: "no" })).toEqual(["3"]);
    expect(ids({ photo: "yes" })).toEqual(["1"]);
    expect(ids({ ch: "catchtable" })).toEqual(["2"]);
    expect(ids({ ch: "none" })).toEqual(["3"]);
    expect(ids({})).toEqual(["1", "2", "3"]);
  });
});

describe("식당 지우기", () => {
  it("아무 데도 안 쓰인 식당만 지울 수 있다", () => {
    expect(canDeleteVenue({ tables: 0, reservations: 0, stock: 0 })).toEqual({ ok: true });
  });
  it("배정·예약·재고 기록이 있으면 막고 배정 끄기를 권한다", () => {
    const r = canDeleteVenue({ tables: 2, reservations: 1, stock: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("배정된 테이블 2개");
      expect(r.reason).toContain("예약 기록 1건");
      expect(r.reason).not.toContain("재고");
      expect(r.reason).toContain("배정 끄기");
    }
    expect(canDeleteVenue({ tables: 0, reservations: 0, stock: 3 }).ok).toBe(false);
  });
});
