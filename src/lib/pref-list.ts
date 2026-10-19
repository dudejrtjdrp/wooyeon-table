// 사람별 보기: 한 사람이 고른 '또 만나고 싶어요'·'다시는 싫어요'와, 이 사람을 고른 사람. 순수 함수 (pref-list.test.ts)

export type PrefRow = { from_user: string; to_user: string; pref: string; table_id: string; created_at: string };
export type PrefItem = { userId: string; tableId: string; pref: "again" | "avoid"; at: string };

const item = (p: PrefRow, other: string): PrefItem => ({ userId: other, tableId: p.table_id, pref: p.pref === "avoid" ? "avoid" : "again", at: p.created_at });
const byNewest = (a: PrefItem, b: PrefItem) => b.at.localeCompare(a.at) || (a.pref === b.pref ? 0 : a.pref === "avoid" ? -1 : 1);

/**
 * gave: 이 사람이 고른 사람, got: 이 사람을 고른 사람. 모임(테이블)마다 한 줄이고 최근 것부터.
 * 같은 시각이면 '다시는 싫어요'를 먼저 (운영자가 먼저 봐야 할 것)
 */
export function prefLists(userId: string, prefs: PrefRow[]) {
  const ok = prefs.filter((p) => p.pref === "again" || p.pref === "avoid");
  const gave = ok.filter((p) => p.from_user === userId && p.to_user !== userId).map((p) => item(p, p.to_user)).sort(byNewest);
  const got = ok.filter((p) => p.to_user === userId && p.from_user !== userId).map((p) => item(p, p.from_user)).sort(byNewest);
  const count = (xs: PrefItem[], k: PrefItem["pref"]) => xs.filter((x) => x.pref === k).length;
  return {
    gave,
    got,
    counts: { gaveAgain: count(gave, "again"), gaveAvoid: count(gave, "avoid"), gotAgain: count(got, "again"), gotAvoid: count(got, "avoid") },
  };
}

/** 화면에 띄우려고 읽어야 하는 사람·테이블 id */
export function prefListIds(l: ReturnType<typeof prefLists>) {
  const all = [...l.gave, ...l.got];
  return { users: [...new Set(all.map((x) => x.userId))], tables: [...new Set(all.map((x) => x.tableId))] };
}
