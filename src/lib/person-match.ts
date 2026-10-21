// 사람별 보기: 한 사람의 선호·차단·신고·만남 기록이 다음 자동 매칭에서 어떻게 쓰이는지 묶는다. 순수 함수 (person-match.test.ts)
// 규칙은 matching/runner.ts loadRelations와 같다: '다시는 싫어요'·차단·신고 = 같은 테이블 제외(양쪽 다),
// 이미 같이 앉음·낮은 후기 = 점수에서 깎음, '또 만나고 싶어요' = 점수에 더함(시연 봇이 고른 건 빼고)

export type MatchRule = "hard" | "soft" | "score" | "off";

/** 배지 문구와 색, 풀이 */
export const RULE: Record<MatchRule, { label: string; tone: "danger" | "candle" | "leaf" | "muted"; tip: string }> = {
  hard: { label: "반드시 떨어뜨림", tone: "danger", tip: "다음 자동 매칭에서 두 사람을 같은 테이블에 절대 앉히지 않아요." },
  soft: { label: "되도록 떨어뜨림", tone: "candle", tip: "같은 테이블이면 점수가 깎여서, 다른 조합이 있으면 그쪽을 골라요. 자리가 모자라면 같이 앉을 수도 있어요." },
  score: { label: "점수에만 반영", tone: "leaf", tip: "같은 테이블이면 점수를 조금 더해요. 같이 앉히라고 강제하지는 않아요." },
  off: { label: "반영 안 함", tone: "muted", tip: "다음 매칭에 쓰지 않아요." },
};

export type Source = "avoid" | "block" | "report" | "again" | "met" | "low";
export const SOURCE_TEXT: Record<Source, string> = {
  avoid: "다시는 싫어요",
  block: "차단",
  report: "신고",
  again: "또 만나고 싶어요",
  met: "같이 앉음",
  low: "후기 낮음",
};

export type Reason = { source: Source; at: string | null; tableId?: string | null };
export type RelationRow = { userId: string; rule: MatchRule; reasons: Reason[]; note?: string };

export type PrefIn = { from_user: string; to_user: string; pref: string; table_id: string | null; created_at: string };
export type BlockIn = { blocker_id: string; blocked_id: string; created_at: string };
export type ReportIn = { reporter_id: string; reported_id: string; created_at: string };
export type MetIn = { userId: string; at: string | null; tableId?: string | null; low?: boolean };

const newest = (r: RelationRow) => r.reasons.reduce((m, x) => (x.at && x.at > m ? x.at : m), "");
const sortRows = (rows: RelationRow[]) => rows.sort((a, b) => newest(b).localeCompare(newest(a)) || a.userId.localeCompare(b.userId));

function collect(items: { other: string; reason: Reason }[], rule: MatchRule): RelationRow[] {
  const m = new Map<string, RelationRow>();
  for (const { other, reason } of items) {
    const row = m.get(other) ?? { userId: other, rule, reasons: [] };
    row.reasons.push(reason);
    m.set(other, row);
  }
  for (const r of m.values()) r.reasons.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return sortRows([...m.values()]);
}

/**
 * avoidByMe: 이 사람이 피하고 싶은 사람(이 사람이 고른 '다시는 싫어요'·차단·신고)
 * avoidMe: 이 사람을 피하고 싶은 사람(상대가 이 사람에게 남긴 것)
 * again: 다시 만나고 싶은 사람(어느 쪽이 골랐든). 피하는 관계가 있거나 시연 봇이 고른 것뿐이면 '반영 안 함'
 * met: 이미 같이 앉은 사람(피하는 관계는 위에 있으니 뺀다). 후기가 낮았으면 함께 표시
 */
export function personMatchView(
  userId: string,
  input: { prefs: PrefIn[]; blocks: BlockIn[]; reports: ReportIn[]; met?: MetIn[]; bots?: Set<string> },
) {
  const { prefs, blocks, reports, met = [], bots = new Set<string>() } = input;
  const mine: { other: string; reason: Reason }[] = [];
  const theirs: { other: string; reason: Reason }[] = [];
  for (const p of prefs) {
    if (p.pref !== "avoid") continue;
    if (p.from_user === userId && p.to_user !== userId) mine.push({ other: p.to_user, reason: { source: "avoid", at: p.created_at, tableId: p.table_id } });
    else if (p.to_user === userId && p.from_user !== userId) theirs.push({ other: p.from_user, reason: { source: "avoid", at: p.created_at, tableId: p.table_id } });
  }
  for (const b of blocks) {
    if (b.blocker_id === userId && b.blocked_id !== userId) mine.push({ other: b.blocked_id, reason: { source: "block", at: b.created_at } });
    else if (b.blocked_id === userId && b.blocker_id !== userId) theirs.push({ other: b.blocker_id, reason: { source: "block", at: b.created_at } });
  }
  for (const r of reports) {
    if (r.reporter_id === userId && r.reported_id !== userId) mine.push({ other: r.reported_id, reason: { source: "report", at: r.created_at } });
    else if (r.reported_id === userId && r.reporter_id !== userId) theirs.push({ other: r.reporter_id, reason: { source: "report", at: r.created_at } });
  }
  const avoidByMe = collect(mine, "hard");
  const avoidMe = collect(theirs, "hard");
  const excluded = new Set([...avoidByMe, ...avoidMe].map((r) => r.userId));

  // 또 만나고 싶어요: 누가 골랐는지(이 사람/상대/서로) 함께 남긴다
  const againItems: { other: string; reason: Reason; byMe: boolean; fromBot: boolean }[] = [];
  for (const p of prefs) {
    if (p.pref !== "again") continue;
    const byMe = p.from_user === userId;
    const other = byMe ? p.to_user : p.from_user;
    if (other === userId || (!byMe && p.to_user !== userId)) continue;
    againItems.push({ other, reason: { source: "again", at: p.created_at, tableId: p.table_id }, byMe, fromBot: bots.has(p.from_user) });
  }
  const again = collect(againItems, "score").map((row) => {
    const its = againItems.filter((x) => x.other === row.userId);
    const me = its.some((x) => x.byMe);
    const them = its.some((x) => !x.byMe);
    const who = me && them ? "서로 골랐어요" : me ? "이 사람이 골랐어요" : "상대가 골랐어요";
    if (excluded.has(row.userId)) return { ...row, rule: "off" as const, note: `${who} · 피하는 관계가 있어 떨어뜨리는 쪽이 우선이에요` };
    if (its.every((x) => x.fromBot)) return { ...row, rule: "off" as const, note: `${who} · 시연 봇이 고른 거라 점수에 안 넣어요` };
    return { ...row, note: who };
  });

  const metRows = collect(
    met.filter((m) => m.userId !== userId && !excluded.has(m.userId)).flatMap((m) => [
      { other: m.userId, reason: { source: "met" as const, at: m.at, tableId: m.tableId } },
      ...(m.low ? [{ other: m.userId, reason: { source: "low" as const, at: m.at, tableId: m.tableId } }] : []),
    ]),
    "soft",
  );

  return { avoidByMe, avoidMe, again, met: metRows };
}
export type PersonMatchView = ReturnType<typeof personMatchView>;

/** 이름을 읽어야 하는 상대 id */
export const personMatchIds = (v: PersonMatchView) => [...new Set([...v.avoidByMe, ...v.avoidMe, ...v.again, ...v.met].map((r) => r.userId))];
