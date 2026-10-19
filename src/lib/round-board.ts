// 회차·식당 화면(/admin/rounds)의 탭과 '일정별 모집 현황' 표. DB를 읽지 않는 순수 함수만 둔다 (round-board.test.ts)
import { dateKey, fmtClock, fmtDay } from "./format";
import { DEFAULT_SETTINGS } from "./matching/types";

/** 화면 탭. 주소의 tab= 값이라 새로고침해도 그대로 열린다 */
export const ROUND_TABS = [
  { key: "status", label: "현황" },
  { key: "edit", label: "고치기" },
  { key: "stock", label: "식당 재고" },
] as const;
export type RoundTab = (typeof ROUND_TABS)[number]["key"] | "new";

/** tab= 값 읽기. 모르는 값이면 '현황' */
export function parseRoundTab(v: string | string[] | undefined): RoundTab {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "edit" || s === "stock" || s === "new" ? s : "status";
}

/** 회차·탭 주소. 현황 탭은 tab= 를 붙이지 않는다 */
export function roundsHref(q: { r?: string; tab?: RoundTab }, hash?: string) {
  const p = new URLSearchParams();
  if (q.r) p.set("r", q.r);
  if (q.tab && q.tab !== "status") p.set("tab", q.tab);
  const s = p.toString();
  return `/admin/rounds${s ? `?${s}` : ""}${hash ? `#${hash}` : ""}`;
}

/** 한 테이블에 앉는 최소·최대 인원 (매칭 엔진과 같은 값) */
export const TABLE_MIN = DEFAULT_SETTINGS.minSize;
export const TABLE_MAX = DEFAULT_SETTINGS.maxSize;

export type BoardSlot = { id: string; region: string; starts_at: string; max_tables: number };
export type BoardCell = { slotId: string; count: number; maxTables: number; short: boolean };
export type BoardCol = { key: string; label: string };
export type Board = {
  cols: BoardCol[];
  rows: { region: string; cells: (BoardCell | null)[] }[];
  /** 모든 일정이 같은 시각에 시작하면 그 시각(저녁 7:30), 아니면 null */
  clock: string | null;
  /** 일정별 최대 테이블 수의 최솟값·최댓값 */
  maxTables: [number, number] | null;
  /** 한 테이블도 못 채우는(최소 인원보다 적은) 칸 수 */
  shortCount: number;
};

/**
 * 줄=동네, 칸=날짜로 모은다. 칸에는 그 일정에 신청한 사람 수.
 * 같은 날 다른 시각 일정이 있으면 칸을 나누고 이름에 시각을 붙인다(11월 6일(금) 저녁 7:30).
 * short: 신청이 최소 인원(4명)보다 적어 테이블을 만들기 어려운 칸. 모집 중인 회차에서만 표시한다(watch=false면 모두 false)
 */
export function buildBoard(slots: BoardSlot[], counts: Map<string, number>, opts: { watch?: boolean; regionOrder?: readonly string[] } = {}): Board {
  const watch = opts.watch ?? true;
  const starts = [...new Set(slots.map((s) => s.starts_at))].sort();
  const perDay = new Map<string, number>();
  for (const st of starts) perDay.set(dateKey(st), (perDay.get(dateKey(st)) ?? 0) + 1);
  const cols = starts.map((st) => ({ key: st, label: (perDay.get(dateKey(st)) ?? 0) > 1 ? `${fmtDay(st)} ${fmtClock(st)}` : fmtDay(st) }));

  const order = opts.regionOrder ?? [];
  const rank = (r: string) => (order.includes(r) ? order.indexOf(r) : order.length);
  const regions = [...new Set(slots.map((s) => s.region))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ko"));

  let shortCount = 0;
  const rows = regions.map((region) => ({
    region,
    cells: starts.map((st) => {
      const sl = slots.find((s) => s.region === region && s.starts_at === st);
      if (!sl) return null;
      const count = counts.get(sl.id) ?? 0;
      const short = watch && count < TABLE_MIN;
      if (short) shortCount++;
      return { slotId: sl.id, count, maxTables: sl.max_tables, short };
    }),
  }));

  const clocks = new Set(starts.map(fmtClock));
  const mt = slots.map((s) => s.max_tables);
  return {
    cols,
    rows,
    clock: clocks.size === 1 ? [...clocks][0] : null,
    maxTables: mt.length ? [Math.min(...mt), Math.max(...mt)] : null,
    shortCount,
  };
}

/** 표 위 한 줄에 쓰는 최대 테이블·자리 수: 같으면 '4'·'24', 다르면 '2~4'·'12~24' */
export function tableRange(b: Board): { tables: string; seats: string } | null {
  if (!b.maxTables) return null;
  const [lo, hi] = b.maxTables;
  const span = (x: number, y: number) => (x === y ? `${y}` : `${x}~${y}`);
  return { tables: span(lo, hi), seats: span(lo * TABLE_MAX, hi * TABLE_MAX) };
}
