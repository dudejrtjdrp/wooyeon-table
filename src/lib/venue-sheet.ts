// 식당 엑셀 양식: 칸 정의와 한 줄 검사 (DB·엑셀 라이브러리 없이 테스트할 수 있게 따로 둔다)
// 운영자가 양식을 내려받아 채운 뒤 올리면, 같은 동네·같은 이름 식당은 고치고 없으면 새로 만든다.

import { PRICE_RANGES } from "./constants";
import { SIDOS } from "./regions";

export const AREAS = SIDOS.flatMap((s) => s.areas);
export const SHEET_PRICES = PRICE_RANGES.filter((p) => p !== "상관없어요");
export const CHANNELS = { "네이버 예약": "naver", "캐치테이블": "catchtable", "전화 예약": "phone" } as const;
export const CHANNEL_NAMES = Object.keys(CHANNELS) as (keyof typeof CHANNELS)[];

export type VenueRow = {
  name: string;
  region: string;
  category: string | null;
  address: string;
  price_range: string | null;
  rating: number | null;
  review_count: number | null;
  booking_channel: "naver" | "catchtable" | "phone" | null;
  booking_url: string | null;
  phone: string | null;
  map_url: string | null;
  seats_per_table: number;
  photo_url: string | null;
  active: boolean;
};

/** 엑셀 첫 줄 제목. 순서가 곧 양식의 칸 순서다 */
export const COLUMNS: { key: keyof VenueRow; label: string; required?: boolean; width: number; help: string; list?: readonly string[] }[] = [
  { key: "name", label: "식당 이름", required: true, width: 22, help: "같은 동네에 같은 이름이 있으면 그 식당을 고쳐요." },
  { key: "region", label: "동네 묶음", required: true, width: 20, help: "목록에서 골라요. 지금은 서울 네 곳(홍대·합정·연남, 잠실·송파, 강남·역삼·선릉, 을지로·종로·광화문)에서 모여요.", list: AREAS },
  { key: "category", label: "업종", width: 16, help: "한 줄로. 예: 한식 주점, 이탈리안, 일식 이자카야" },
  { key: "address", label: "주소", required: true, width: 36, help: "도로명 주소. 지도 버튼이 이 주소로 찾아요." },
  { key: "price_range", label: "1인 가격대", width: 12, help: "참가자가 고른 가격대와 맞는 식당을 먼저 배정해요.", list: SHEET_PRICES },
  { key: "rating", label: "리뷰 평점", width: 10, help: "0~5. 4.3 이상인 식당을 먼저 배정해요(운영사 Q&A)." },
  { key: "review_count", label: "리뷰 수", width: 10, help: "숫자만." },
  { key: "booking_channel", label: "예약 채널", width: 14, help: "네이버 예약·캐치테이블이면 자동 예약 요청을 보내요.", list: CHANNEL_NAMES },
  { key: "booking_url", label: "예약 페이지 주소", width: 36, help: "https:// 로 시작. 자동 예약이 안 될 때 운영자가 여는 곳이에요." },
  { key: "phone", label: "전화번호", width: 16, help: "예: 02-123-4567" },
  { key: "map_url", label: "지도 링크", width: 30, help: "비워 두면 이름·주소로 네이버 지도·카카오맵을 찾아요." },
  { key: "seats_per_table", label: "테이블당 좌석", width: 12, help: "4~8. 비워 두면 6." },
  { key: "photo_url", label: "사진 주소", width: 36, help: "선택. https:// 이미지 주소. 사진 파일은 어드민 식당 관리에서 따로 올려도 돼요." },
  { key: "active", label: "사용", width: 8, help: "예/아니오. 아니오면 배정하지 않아요. 비워 두면 예.", list: ["예", "아니오"] },
];

const text = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v && "text" in v) return String((v as { text: unknown }).text ?? "").trim(); // 엑셀 하이퍼링크 칸
  if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result ?? "").trim(); // 수식 칸
  return String(v).trim();
};
const num = (v: unknown) => {
  const s = text(v).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isUrl = (s: string) => /^https:\/\/[^\s]+$/.test(s);

/** 엑셀 한 줄(제목 → 값)을 검사해 DB에 넣을 모양으로 바꾼다. 문제가 있으면 사람 말로 된 이유를 모아 준다 */
export function parseVenueRow(raw: Record<string, unknown>): { ok: true; value: VenueRow } | { ok: false; errors: string[] } {
  const get = (key: keyof VenueRow) => raw[COLUMNS.find((c) => c.key === key)!.label];
  const errors: string[] = [];
  const name = text(get("name"));
  const region = text(get("region"));
  const address = text(get("address"));
  if (!name) errors.push("식당 이름이 비어 있어요");
  if (!region) errors.push("동네 묶음이 비어 있어요");
  else if (!AREAS.includes(region)) errors.push(`동네 묶음 '${region}'은 목록에 없어요`);
  if (!address) errors.push("주소가 비어 있어요");

  const price = text(get("price_range"));
  if (price && !SHEET_PRICES.includes(price as (typeof SHEET_PRICES)[number])) errors.push(`1인 가격대는 ${SHEET_PRICES.join("·")} 중 하나예요`);
  const rating = num(get("rating"));
  if (rating !== null && (Number.isNaN(rating) || rating < 0 || rating > 5)) errors.push("리뷰 평점은 0~5 사이 숫자예요");
  const reviews = num(get("review_count"));
  if (reviews !== null && (Number.isNaN(reviews) || reviews < 0 || !Number.isInteger(reviews))) errors.push("리뷰 수는 0 이상 정수예요");
  const ch = text(get("booking_channel"));
  const channel = ch ? (CHANNELS as Record<string, VenueRow["booking_channel"]>)[ch] ?? (["naver", "catchtable", "phone"].includes(ch) ? (ch as VenueRow["booking_channel"]) : undefined) : null;
  if (channel === undefined) errors.push(`예약 채널은 ${CHANNEL_NAMES.join("·")} 중 하나예요`);
  const bookingUrl = text(get("booking_url"));
  if (bookingUrl && !isUrl(bookingUrl)) errors.push("예약 페이지 주소는 https:// 로 시작해야 해요");
  const mapUrl = text(get("map_url"));
  if (mapUrl && !isUrl(mapUrl)) errors.push("지도 링크는 https:// 로 시작해야 해요");
  const photo = text(get("photo_url"));
  if (photo && !isUrl(photo)) errors.push("사진 주소는 https:// 로 시작해야 해요");
  const phone = text(get("phone"));
  if (phone && !/^[0-9\-\s()+]{8,20}$/.test(phone)) errors.push("전화번호는 숫자와 - 만 써 주세요");
  const seats = num(get("seats_per_table"));
  if (seats !== null && (Number.isNaN(seats) || !Number.isInteger(seats) || seats < 4 || seats > 8)) errors.push("테이블당 좌석은 4~8 사이 정수예요");
  const act = text(get("active"));
  if (act && !["예", "아니오", "Y", "N", "y", "n", "TRUE", "FALSE", "true", "false"].includes(act)) errors.push("사용은 예 또는 아니오예요");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, region, address,
      category: text(get("category")) || null,
      price_range: price || null,
      rating: rating === null ? null : Math.round(rating * 10) / 10,
      review_count: reviews,
      booking_channel: channel ?? null,
      booking_url: bookingUrl || null,
      phone: phone || null,
      map_url: mapUrl || null,
      seats_per_table: seats ?? 6,
      photo_url: photo || null,
      active: !act || ["예", "Y", "y", "TRUE", "true"].includes(act),
    },
  };
}

/** DB 한 줄 → 엑셀 한 줄 (지금 식당을 내려받아 고쳐 올릴 때) */
export function venueToSheet(v: Partial<VenueRow>): Record<string, string | number> {
  const back = Object.fromEntries(Object.entries(CHANNELS).map(([k, val]) => [val, k]));
  const out: Record<string, string | number> = {};
  for (const c of COLUMNS) {
    const val = v[c.key];
    if (c.key === "booking_channel") out[c.label] = val ? back[val as string] ?? "" : "";
    else if (c.key === "active") out[c.label] = val === false ? "아니오" : "예";
    else if (c.key === "photo_url") out[c.label] = typeof val === "string" && /^https:\/\//.test(val) ? val : ""; // 업로드한 사진(내부 주소)은 내보내지 않는다
    else out[c.label] = val === null || val === undefined ? "" : (val as string | number);
  }
  return out;
}

/** 사진 파일 이름(확장자 뺀 것)으로 식당을 찾는다: '잠실 호숫가 식탁.jpg' 또는 '잠실·송파_잠실 호숫가 식탁.jpg' */
export function matchPhotoName(file: string, venues: { id: string; name: string; region: string }[]) {
  const base = file.replace(/\.[a-z0-9]+$/i, "").normalize("NFC").trim();
  const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();
  const [maybeRegion, maybeName] = base.includes("_") ? [base.slice(0, base.indexOf("_")), base.slice(base.indexOf("_") + 1)] : [null, base];
  const hits = venues.filter((v) => norm(v.name) === norm(maybeName) && (!maybeRegion || norm(v.region) === norm(maybeRegion)));
  return hits.length === 1 ? hits[0] : null;
}
