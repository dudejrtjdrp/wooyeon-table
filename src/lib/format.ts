const TZ = "Asia/Seoul";

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short", ...opts }).format(new Date(iso));
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDateTime(iso: string) {
  // 정확히 0시(마감 시각)는 전날 '밤 12시'로 쓴다
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  if (hm === "00:00") return `${fmtDate(new Date(new Date(iso).getTime() - 60_000).toISOString())} 밤 12시`;
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

/** 같은 날짜끼리 묶을 때 쓰는 키 (서울 기준) */
export function dateKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}

/** 10월 23일(금) */
export function fmtDay(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("month")}월 ${g("day")}일(${g("weekday")})`;
}

/** 저녁 7:30 / 낮 12:00 / 오전 9:00 */
export function fmtClock(iso: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const [h, m] = p.split(":").map(Number);
  const part = h < 6 ? "새벽" : h < 11 ? "오전" : h < 15 ? "낮" : h < 18 ? "오후" : "저녁";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${part} ${h12}${m ? `:${String(m).padStart(2, "0")}` : "시"}`;
}

/** 10월 23일(금) 저녁 7:30. 정확히 0시(마감 시각)면 전날 '밤 12시'로 쓴다: 11월 4일 0시 → 11월 3일(화) 밤 12시 */
export function fmtSlot(iso: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  if (p === "00:00") return `${fmtDay(new Date(new Date(iso).getTime() - 60_000).toISOString())} 밤 12시`;
  return `${fmtDay(iso)} ${fmtClock(iso)}`;
}

/** 오늘(서울 기준)부터 그날까지 남은 날 수. 0이면 오늘 */
export function dday(iso: string, now: Date) {
  const a = Date.parse(`${dateKey(now.toISOString())}T00:00:00+09:00`);
  const b = Date.parse(`${dateKey(iso)}T00:00:00+09:00`);
  return Math.round((b - a) / 86400_000);
}
export const ddayLabel = (n: number) => (n <= 0 ? "D-day" : `D-${n}`);
