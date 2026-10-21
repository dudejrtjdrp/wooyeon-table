// 이용권 만료일 계산 (DB 없이 계산만). 결제 승인·시연 패널·시연 봇이 같이 쓴다
/** 이용권 만료일: 멤버십은 산 날부터 N개월, 1회권은 60일. from은 시연용 가상 시각(lib/clock now()) */
export function passExpiresAt(months: number | null | undefined, from: Date): Date {
  const d = new Date(from.getTime());
  if (months) d.setMonth(d.getMonth() + months);
  else d.setDate(d.getDate() + 60);
  return d;
}

/**
 * 이용권 기한이 다가올 때 보낼 알림 단계 (성효님 결정 2026-10-21: 기한 전에 세 번).
 * 기한은 '신청할 때' 기준이라, 기한 안에 신청만 하면 모임이 그 뒤여도 쓸 수 있다.
 * 7일 전·3일 전·하루 전. 이미 지난 단계는 건너뛰고 지금 단계만 보낸다(같은 단계는 dedupe 키로 한 번)
 */
export type ExpiryStage = { key: "d7" | "d3" | "d1"; left: string };
export function expiryStage(expiresAt: string | Date, now: Date): ExpiryStage | null {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  const DAY = 86400_000;
  if (ms <= 0 || ms > 7 * DAY) return null;
  if (ms <= DAY) return { key: "d1", left: "하루" };
  if (ms <= 3 * DAY) return { key: "d3", left: "3일" };
  return { key: "d7", left: "일주일" };
}
