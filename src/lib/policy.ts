// 취소·환불 마감 (운영사 Q&A 2026-10-16: "화요일 자정(24:00) 이후 환불 불가")
// 모임이 있는 주의 화요일 24:00(= 수요일 0시, 한국 시간)이 환불 마감이고, 매칭 마감도 같은 시각으로 둔다.
// 결과를 보고 환불하는 일을 막기 위해서다. 월·화 모임이면 그 전 주 화요일 24:00이 마감이다.

const KST = 9 * 3600_000;
const DAY = 86400_000;

/** 이 모임의 환불 마감(= 매칭 마감) 시각 */
export function refundCutoff(startsAt: string | Date): Date {
  const start = new Date(startsAt).getTime();
  // 한국 시간 기준 모임 날짜 0시
  const dayStart = Math.floor((start + KST) / DAY) * DAY - KST;
  const dow = new Date(dayStart + KST).getUTCDay(); // 0=일 … 3=수
  const back = (dow - 3 + 7) % 7; // 그 날짜에서 가장 가까운(같거나 이전) 수요일까지 며칠
  return new Date(dayStart - back * DAY);
}

/** 여러 일정 중 가장 이른 모임의 마감 (회차의 매칭 마감 기본값) */
export function roundCutoff(starts: string[]): Date | null {
  if (!starts.length) return null;
  return new Date(Math.min(...starts.map((s) => refundCutoff(s).getTime())));
}

export const CUTOFF_LABEL = "모임 주 화요일 밤 12시";
