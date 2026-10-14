// 신청서 선택지. 운영 중인 구글폼 항목을 앱으로 옮긴 것.
export const REGIONS = ["성수", "강남", "홍대", "여의도"] as const;

export const INTERESTS = [
  "맛집 탐방", "여행", "운동", "영화·드라마", "음악·공연", "책",
  "전시·미술", "와인·술", "게임", "사진", "커리어", "반려동물",
] as const;

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
  "매칭이 안 되면 다른 일정으로 옮기거나, 이용권을 보관하거나, 환불받을 수 있어요.",
];

export function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}
