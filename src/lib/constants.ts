// 신청서 선택지. 운영 중인 구글폼 항목을 앱으로 옮긴 것.
import { SIDOS } from "./regions";
/** 운영 가능한 동네 묶음 전체 (시·도 → 묶음). 지역 단위는 동네 묶음이다 */
export const REGIONS: readonly string[] = SIDOS.flatMap((s) => s.areas);
/** 지금 운영하는 동네 (운영사 Q&A: 서울 4곳). 새 회차 기본값이고, 나머지는 수요 조사만 받는다 */
export const DEFAULT_REGIONS = ["홍대·합정·연남", "잠실·송파", "강남·역삼·선릉", "을지로·종로·광화문"] as const;
export const OPEN_REGIONS: readonly string[] = DEFAULT_REGIONS;

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

// 가격은 운영사 Q&A 답변(2026-10-16) 그대로다. docs/prd/08-qna.md
// 1회권은 한 번 쓰면 끝, 멤버십은 기간 안에 횟수 제한 없이 신청한다. 멤버십으로 낸 신청이 매칭에 실패하면 1회당 7일 늘려 준다.
export const PASSES = {
  single: { label: "1회권", count: 1, months: 0, amount: 9900, desc: "한 번 참여해 보고 싶을 때" },
  m1: { label: "멤버십 1개월", count: 0, months: 1, amount: 35000, desc: "한 달 동안 원하는 만큼" },
  m3: { label: "멤버십 3개월", count: 0, months: 3, amount: 75000, desc: "한 달에 25,000원꼴" },
  m6: { label: "멤버십 6개월", count: 0, months: 6, amount: 120000, desc: "한 달에 20,000원꼴" },
} as const;
/** 예전 '구독 3회권'(시연 데이터)은 이름만 남겨 둔다 */
export const LEGACY_PASS_LABEL: Record<string, string> = { subscription: "구독 3회권" };
export const isMembership = (t: string | null | undefined) => t === "m1" || t === "m3" || t === "m6";
/** 멤버십 매칭 실패 1회당 늘려 주는 기간 (모임이 주 1회라 7일) */
export const MEMBERSHIP_EXTEND_DAYS = 7;
export type PassType = keyof typeof PASSES;

/** 테스트 결제창이 실패했을 때 시연을 이어 가는 길 (결제 화면 아래 시연용 버튼). 실서비스 키면 안 보인다 */
export const PAY_DEMO_HINT = "시연 중이면 아래 '결제창 없이 바로 결제 완료(시연용)'를 눌러 주세요";

export const REFUND_POLICY = [
  "모임 주 화요일 밤 12시까지는 전액 환불돼요. 이때 매칭도 함께 마감돼요.",
  "그 뒤로는 환불이 안 돼요. 멤버십은 신청할 때 횟수를 차감하지 않아서, 신청을 취소해도 기간 안에 다른 일정에 바로 신청할 수 있어요.",
  "당일 취소와 단체방 나가기는 할 수 없어요.",
  "연락 없이 오지 않으면(노쇼) 환불이 안 되고, 90일 안에 두 번이면 30일 동안 신청이 막혀요.",
  "매칭이 안 되면 다른 일정으로 옮기거나 자리를 기다릴 수 있어요. 1회권은 이용권 보관·환불도 고를 수 있고, 멤버십은 기간을 7일 늘려 드려요.",
];

export function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}
