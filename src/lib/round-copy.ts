// 회차 복제: 지난 회차의 요일·시각·동네·최대 테이블 수로 '새 회차 만들기' 칸을 채울 값을 만든다.
// 저장은 하지 않는다. 화면이 이 값을 f= 쿼리로 넘기면 새 회차 탭이 채워진 채로 열리고, 운영자가 고쳐서 '회차 만들기'를 누른다.
// DB를 읽지 않는 순수 함수 (round-copy.test.ts)
import { roundCutoff } from "./policy";

const KST = 9 * 3600_000;
const DAY = 86_400_000;

/** 새 회차 만들기 폼 값 (rounds/page.tsx의 Draft, actions.ts의 failRound와 같은 칸) */
export type RoundDraft = {
  title?: string;
  deadline?: string;
  match_at?: string;
  dates?: string[];
  time?: string;
  duration?: string;
  regions?: string[];
  max_tables?: string;
  /** 복제한 원래 회차 이름. 화면에 '…에서 가져왔어요' 안내를 띄우는 데만 쓴다 */
  from?: string;
};

export type CopySource = { title: string; slots: { region: string; starts_at: string; ends_at: string; max_tables: number }[] };

/** 폼의 날짜 칸이 두 개라 날짜는 앞에서 두 개까지만 옮긴다 */
export const COPY_MAX_DATES = 2;
const ORD = ["첫", "둘", "셋", "넷", "다섯"];

const kstDate = (iso: string) => new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 10);
const kstClock = (iso: string) => new Date(new Date(iso).getTime() + KST).toISOString().slice(11, 16);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** "10월 넷째 주 저녁" → 새 첫 날짜 기준 "11월 첫째 주 저녁". 주차 이름이 없으면 null */
export function nextWeekTitle(title: string, firstDate: string): string | null {
  const m = Number(firstDate.slice(5, 7));
  const week = Math.ceil(Number(firstDate.slice(8, 10)) / 7);
  const ord = /(\d{1,2})월\s*(첫|둘|셋|넷|다섯)째\s*주/;
  if (ord.test(title)) return title.replace(ord, `${m}월 ${ORD[week - 1]}째 주`);
  const num = /(\d{1,2})월\s*(\d)\s*주차/;
  if (num.test(title)) return title.replace(num, `${m}월 ${week}주차`);
  return null;
}

/**
 * 복제 값 만들기. 날짜는 같은 요일로 한 주씩 미루되, 신청 마감(모임 주 화요일 밤 12시)이 아직 안 지났고
 * 이미 열린 회차와 날짜·동네가 겹치지 않는 가장 가까운 주로 잡는다.
 * 마감·매칭 시각은 비워 두어 새 날짜에 맞춰 운영 규칙대로 다시 잡히게 한다. 일정이 없으면 이름만 채운다
 */
/** 이미 열려 있는 일정(취소·종료 회차 제외). 같은 날짜·같은 동네면 겹친다고 본다 */
export type TakenSlot = { region: string; starts_at: string };

/** 새로 만들 일정 중 이미 있는 일정과 같은 날짜·동네인 것들 ("10월 30일 홍대·합정·연남") */
export function slotClashes(rows: { region: string; date: string }[], taken: TakenSlot[]): { region: string; date: string }[] {
  const key = (region: string, date: string) => `${date}|${region}`;
  const have = new Set(taken.map((t) => key(t.region, kstDate(t.starts_at))));
  return rows.filter((r) => have.has(key(r.region, r.date)));
}

export function copyRoundDraft(src: CopySource, now: Date, taken: TakenSlot[] = []): RoundDraft {
  const slots = [...src.slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!slots.length) return { title: `${src.title} (복사)`, from: src.title };
  const first = slots[0];
  const time = kstClock(first.starts_at);
  const duration = Math.max(60, Math.round((Date.parse(first.ends_at) - Date.parse(first.starts_at)) / 60_000));
  const dates0 = [...new Set(slots.map((s) => kstDate(s.starts_at)))].slice(0, COPY_MAX_DATES);
  const regions0 = [...new Set(slots.map((s) => s.region))];
  // 마감이 안 지났고, 이미 열린 회차와 같은 날짜·동네가 하나도 없는 가장 가까운 주
  let weeks = 1;
  while (weeks < 60) {
    const ds = dates0.map((d) => addDays(d, weeks * 7));
    const cut = roundCutoff(ds.map((d) => `${d}T${time}:00+09:00`));
    const clash = slotClashes(ds.flatMap((date) => regions0.map((region) => ({ region, date }))), taken).length > 0;
    if (cut && cut.getTime() > now.getTime() && !clash) break;
    weeks++;
  }
  const dates = dates0.map((d) => addDays(d, weeks * 7));
  const regions = regions0;
  const maxTables = Math.max(...slots.map((s) => s.max_tables || 1));
  return {
    title: nextWeekTitle(src.title, dates[0]) ?? `${src.title} (복사)`,
    dates,
    time,
    duration: String(duration),
    regions,
    max_tables: String(maxTables),
    from: src.title,
  };
}

/** 새 회차 탭 주소. 기존 검증 실패 때와 같은 f= 방식으로 넘긴다 */
export const copyRoundHref = (d: RoundDraft) => `/admin/rounds?tab=new&f=${encodeURIComponent(JSON.stringify(d))}#new-round`;
