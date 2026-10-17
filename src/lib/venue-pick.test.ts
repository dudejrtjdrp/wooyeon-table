import { describe, expect, it } from "vitest";
import { type VenueOption, pickVenue, rankVenues } from "./venue-pick";

const REGION = "홍대·합정·연남";
const v = (id: string, o: Partial<VenueOption> = {}): VenueOption => ({ venueId: id, name: id, region: REGION, active: true, rating: 4.5, channel: "naver", seats: 6, tablesAvailable: 2, ...o });
const need = (o: Partial<Parameters<typeof rankVenues>[1]> = {}) => ({ region: REGION, party: 5, used: new Map<string, number>(), ...o });

describe("식당 고르기 (G2)", () => {
  it("다른 지역·쉬는 식당·자리 없는 식당·인원이 안 앉는 식당은 빼고 고른다", () => {
    const options = [
      v("다른동네", { region: "잠실·송파" }),
      v("휴업", { active: false }),
      v("꽉참", { tablesAvailable: 1 }),
      v("4인석", { seats: 4 }),
      v("가능"),
    ];
    expect(rankVenues(options, need({ used: new Map([["꽉참", 1]]) })).map((x) => x.venueId)).toEqual(["가능"]);
  });

  it("평점 4.3 이상 + 네이버·캐치테이블을 먼저 고르고, 전화 예약 식당은 평점이 높아도 뒤로 간다", () => {
    const options = [v("전화맛집", { rating: 4.9, channel: "phone" }), v("평점낮음", { rating: 4.0, channel: "catchtable" }), v("캐치", { rating: 4.4, channel: "catchtable" }), v("네이버", { rating: 4.6 })];
    expect(rankVenues(options, need()).map((x) => x.venueId)).toEqual(["네이버", "캐치", "전화맛집", "평점낮음"]);
  });

  it("예약이 안 된 식당을 빼면 같은 지역의 다음 식당이 나오고, 다 빼면 null(그때만 운영자 예외)", () => {
    const options = [v("A", { rating: 4.6 }), v("B", { rating: 4.4 })];
    expect(pickVenue(options, need())?.venueId).toBe("A");
    expect(pickVenue(options, need({ exclude: new Set(["A"]) }))?.venueId).toBe("B");
    expect(pickVenue(options, need({ exclude: new Set(["A", "B"]) }))).toBeNull();
  });

  it("평점이 같으면 이 일정에 덜 쓴 식당, 같은 입력이면 늘 같은 결과", () => {
    const options = [v("A"), v("B")];
    expect(pickVenue(options, need({ used: new Map([["A", 1]]) }))?.venueId).toBe("B");
    expect(rankVenues([...options].reverse(), need())).toEqual(rankVenues(options, need()));
  });

  it("같은 등급 식당이면 테이블 사람들 가격대에 맞는 곳을 먼저, 등급이 높은 식당이 가격보다 앞선다", () => {
    const cheap = v("골목", { rating: 4.6, priceRange: "1만 원대" });
    const mid = v("둥근", { rating: 4.5, priceRange: "2만 원대" });
    const phone = v("전화", { rating: 4.8, channel: "phone", priceRange: "2만 원대" });
    const prices = ["2만 원대", "2만 원대", "상관없어요", "1만 원대"];
    expect(rankVenues([cheap, mid, phone], need({ prices })).map((x) => x.venueId)).toEqual(["둥근", "골목", "전화"]);
    // 가격대를 모르면 예전처럼 평점 순
    expect(pickVenue([cheap, mid], need())?.venueId).toBe("골목");
  });
});
