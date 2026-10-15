// 신청서 선택지. 운영 중인 구글폼 항목을 앱으로 옮긴 것.
import { SIDOS } from "./regions";
/** 운영 가능한 동네 묶음 전체 (시·도 → 묶음). 지역 단위는 동네 묶음이다 */
export const REGIONS: readonly string[] = SIDOS.flatMap((s) => s.areas);
/** 새 회차를 만들 때 기본으로 여는 묶음 (지금 식당이 있는 곳) */
export const DEFAULT_REGIONS = ["성수·건대", "강남·역삼·선릉", "홍대·합정·연남", "여의도·영등포"] as const;

export const INTERESTS = [
  "맛집 탐방", "여행", "운동", "영화·드라마", "음악·공연", "책",
  "전시·미술", "와인·술", "게임", "사진", "커리어", "반려동물",
  // 2026-10-16 E안 관심사 그룹(움직이기·먹고 마시기)에 맞춰 추가
  "러닝", "등산", "요가", "클라이밍", "커피", "요리",
] as const;

/** 관심사 화면(E05)의 묶음. 값은 INTERESTS 그대로 쓴다 */
export const INTEREST_GROUPS: { name: string; items: (typeof INTERESTS)[number][] }[] = [
  { name: "움직이기", items: ["운동", "러닝", "등산", "요가", "클라이밍"] },
  { name: "보고 듣기", items: ["영화·드라마", "음악·공연", "전시·미술", "책"] },
  { name: "먹고 마시기", items: ["맛집 탐방", "와인·술", "커피", "요리"] },
  { name: "그 밖에", items: ["여행", "사진", "반려동물", "커리어", "게임"] },
];

/** 못 먹는 음식 빠른 선택(E06). 고른 값은 알레르기 입력과 함께 food_restrictions에 글로 남긴다 */
export const FOOD_AVOID = ["갑각류", "견과류", "날것", "오이", "매운 음식", "고기", "술"] as const;

export const TRAITS = [
  "유쾌한", "차분한", "다정한", "솔직한", "호기심 많은", "리액션 좋은", "진지한", "에너지 넘치는",
] as const;

export const MBTIS = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;

export const PRICE_RANGES = ["1만 원대", "2만 원대", "3만 원대", "상관없어요"] as const;

// 가격은 해커톤 시연용 임시값이다. 실제 가격은 운영팀 확인이 필요하다.
export const PASSES = {
  single: { label: "1회권", count: 1, amount: 29000, desc: "한 번 참여해 보고 싶을 때" },
  subscription: { label: "구독 3회권", count: 3, amount: 75000, desc: "한 달에 세 번, 한 번에 25,000원" },
} as const;
export type PassType = keyof typeof PASSES;

export const REFUND_POLICY = [
  "모임 2일 전까지는 전액 환불돼요.",
  "모임 2일 전부터는 환불이 안 돼요.",
  "당일 취소와 단체방 나가기는 할 수 없어요.",
  "연락 없이 오지 않으면(노쇼) 환불이 안 되고, 운영팀이 이용 제한을 검토해요.",
  "매칭이 안 되면 다른 일정으로 옮기거나, 이용권을 보관하거나, 환불받을 수 있어요.",
];

export function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}
