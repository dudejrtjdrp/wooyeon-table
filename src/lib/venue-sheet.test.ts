import { describe, expect, it } from "vitest";
import { matchPhotoName, parseVenueRow, venueToSheet } from "./venue-sheet";

const row = (o: Record<string, unknown>) => ({ "식당 이름": "잠실 호숫가 식탁", "동네 묶음": "잠실·송파", "주소": "서울 송파구 올림픽로 1", ...o });

describe("식당 엑셀 한 줄 검사", () => {
  it("필수 칸만 있어도 들어가고, 빈 칸은 기본값", () => {
    const r = parseVenueRow(row({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.seats_per_table).toBe(6);
      expect(r.value.active).toBe(true);
      expect(r.value.booking_channel).toBeNull();
    }
  });
  it("한글 예약 채널·숫자 칸을 바꾼다", () => {
    const r = parseVenueRow(row({ "예약 채널": "캐치테이블", "리뷰 평점": "4.56", "리뷰 수": "1,204", "사용": "아니오", "1인 가격대": "2만 원대" }));
    expect(r.ok && r.value).toMatchObject({ booking_channel: "catchtable", rating: 4.6, review_count: 1204, active: false, price_range: "2만 원대" });
  });
  it("틀린 값은 이유를 모두 알려 준다", () => {
    const r = parseVenueRow({ "식당 이름": "", "동네 묶음": "강남", "주소": "", "리뷰 평점": "6", "예약 채널": "배민", "1인 가격대": "5만 원대", "사진 주소": "http://x", "테이블당 좌석": "10" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(8);
  });
  it("내려받기는 업로드한 사진(내부 주소)을 빼고 채널을 한글로", () => {
    const s = venueToSheet({ name: "a", region: "잠실·송파", address: "b", booking_channel: "naver", photo_url: "/api/venue-photo/x", active: true });
    expect(s["예약 채널"]).toBe("네이버 예약");
    expect(s["사진 주소"]).toBe("");
    expect(s["사용"]).toBe("예");
  });
});

describe("사진 파일 이름으로 식당 찾기", () => {
  const vs = [{ id: "1", name: "잠실 호숫가 식탁", region: "잠실·송파" }, { id: "2", name: "골목부엌", region: "을지로·종로·광화문" }, { id: "3", name: "골목부엌", region: "홍대·합정·연남" }];
  it("이름만, 또는 동네_이름", () => {
    expect(matchPhotoName("잠실 호숫가 식탁.jpg", vs)?.id).toBe("1");
    expect(matchPhotoName("홍대·합정·연남_골목부엌.png", vs)?.id).toBe("3");
  });
  it("같은 이름이 둘이면 동네 없이는 고르지 않는다", () => {
    expect(matchPhotoName("골목부엌.jpg", vs)).toBeNull();
  });
});
