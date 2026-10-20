// 이용권 만료일 계산 (DB 없이 계산만). 결제 승인·시연 패널·시연 봇이 같이 쓴다
/** 이용권 만료일: 멤버십은 산 날부터 N개월, 1회권은 60일. from은 시연용 가상 시각(lib/clock now()) */
export function passExpiresAt(months: number | null | undefined, from: Date): Date {
  const d = new Date(from.getTime());
  if (months) d.setMonth(d.getMonth() + months);
  else d.setDate(d.getDate() + 60);
  return d;
}
