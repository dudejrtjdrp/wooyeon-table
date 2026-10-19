import { dateKey, fmtDay } from "./format";

/** 모임 날짜(서울 기준)를 겹치지 않게 모아 날짜순으로 */
function days(slotStarts: string[]) {
  const seen = new Map<string, string>();
  for (const s of slotStarts) {
    if (!s || Number.isNaN(new Date(s).getTime())) continue;
    const k = dateKey(s);
    if (!seen.has(k)) seen.set(k, s);
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, iso]) => fmtDay(iso));
}

/** 같은 달이면 뒤 날짜의 '11월 '을 뗀다: 11월 7일(토) → 7일(토) */
function tail(prev: string, next: string) {
  const m = (x: string) => x.slice(0, x.indexOf("월") + 1);
  return m(prev) === m(next) ? next.slice(m(next).length + 1) : next;
}

/** 모임 날짜만: 11월 6일(금)·7일(토) / 셋 이상은 11월 6일(금)~8일(일). 날짜가 없으면 빈 문자열 */
export function roundDates(slotStarts: string[]) {
  const d = days(slotStarts);
  if (!d.length) return "";
  if (d.length === 1) return d[0];
  if (d.length === 2) return `${d[0]}·${tail(d[0], d[1])}`;
  return `${d[0]}~${tail(d[0], d[d.length - 1])}`;
}

/** 어드민 회차 이름: 11월 첫째 주 저녁 (11월 6일(금)·7일(토)). 일정이 없으면 이름만 */
export function roundLabel(title: string, slotStarts: string[]) {
  const d = roundDates(slotStarts);
  return d ? `${title} (${d})` : title;
}
