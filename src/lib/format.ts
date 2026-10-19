const TZ = "Asia/Seoul";

/*
 * 날짜·시각 표기는 한 가지로 쓴다(참가자 화면·알림·어드민 공통).
 *   날짜: 11월 6일(금)            → fmtDay
 *   시각: 저녁 7:30 / 낮 12시     → fmtClock
 *   둘 다: 11월 6일(금) 저녁 7:30 → fmtSlot (정확히 0시는 전날 '밤 12시')
 * fmtDate·fmtTime·fmtDateTime은 예전 이름이라 남겨 두고, 출력은 위 표기와 같다.
 */

/** 11월 6일(금). opts를 주면 예전처럼 Intl 표기를 그대로 쓴다 */
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  if (Object.keys(opts).length === 0) return fmtDay(iso);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short", ...opts }).format(new Date(iso));
}

/** 저녁 7:30 (fmtClock과 같다) */
export function fmtTime(iso: string) {
  return fmtClock(iso);
}

/** 11월 6일(금) 저녁 7:30. 정확히 0시는 전날 '밤 12시' (fmtSlot과 같다) */
export function fmtDateTime(iso: string) {
  return fmtSlot(iso);
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

/** 날짜와 시각을 두 줄로 쓸 때. 0시는 fmtSlot처럼 전날 '밤 12시' */
export function fmtDayClock(iso: string): [string, string] {
  const [day, ...rest] = fmtSlot(iso).split(") ");
  return [`${day})`, rest.join(") ")];
}

/** 오늘(서울 기준)부터 그날까지 남은 날 수. 0이면 오늘 */
export function dday(iso: string, now: Date) {
  const a = Date.parse(`${dateKey(now.toISOString())}T00:00:00+09:00`);
  const b = Date.parse(`${dateKey(iso)}T00:00:00+09:00`);
  return Math.round((b - a) / 86400_000);
}
export const ddayLabel = (n: number) => (n <= 0 ? "D-day" : `D-${n}`);

/** 이름 뒤 '으로/로': 받침이 있으면 '으로'(ㄹ 받침은 '로'). 한글이 아니면 '로' */
export function withRo(name: string) {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${name}로`;
  const jong = c % 28;
  return `${name}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}
