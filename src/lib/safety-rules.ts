// 피드백·안전: 사람별 비선호·차단 묶기와 신고 다시 열기 판단. DB를 읽지 않는 순수 함수만 둔다 (safety-rules.test.ts)

export const REPORT_ACTION: Record<string, string> = { none: "조치 없음", warning: "경고", restricted: "참가 제한", banned: "영구 제한" };

/** 신고 상태 배지 문구. open이면 검토 전, 아니면 내린 조치 */
export const reportStatusText = (r: { status: string; action: string | null }) => (r.status === "open" ? "검토 전" : REPORT_ACTION[r.action ?? "none"] ?? "검토 끝");

/** 닫은 신고만 다시 열 수 있다 */
export function reopenCheck(r: { status: string } | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!r) return { ok: false, message: "신고를 찾지 못했어요" };
  if (r.status === "open") return { ok: false, message: "이미 검토 전인 신고예요. 예외 처리함에서 조치해 주세요" };
  if (r.status !== "reviewed") return { ok: false, message: "다시 열 수 없는 상태예요" };
  return { ok: true };
}

/** 다시 열 때 이력에 남길 '이전 결정' 한 줄 */
export const reopenReason = (r: { action: string | null; admin_note: string | null }, note: string) =>
  `신고 다시 열기 (이전 결정: ${REPORT_ACTION[r.action ?? "none"] ?? "검토 끝"}${r.admin_note ? `, 메모: ${r.admin_note.slice(0, 60)}` : ""}): ${note}`;

export type Pref = { from_user: string; to_user: string; pref: string; created_at: string };
export type Block = { blocker_id: string; blocked_id: string; created_at: string };
export type Relation = { userId: string; times: number; last: string };

const group = (pairs: { other: string; at: string }[]): Relation[] => {
  const m = new Map<string, Relation>();
  for (const p of pairs) {
    const cur = m.get(p.other);
    m.set(p.other, { userId: p.other, times: (cur?.times ?? 0) + 1, last: !cur || p.at > cur.last ? p.at : cur.last });
  }
  return [...m.values()].sort((a, b) => b.last.localeCompare(a.last));
};

/**
 * 한 사람이 남긴/받은 '다시는 싫어요'·차단. 같은 상대에게 여러 모임에서 남겼으면 한 줄로 묶고 횟수를 센다.
 * '또 만나고 싶어요'는 검토 대상이 아니라 수만 센다
 */
export function personRelations(userId: string, prefs: Pref[], blocks: Block[]) {
  const mine = prefs.filter((p) => p.from_user === userId);
  const theirs = prefs.filter((p) => p.to_user === userId);
  return {
    gaveAvoid: group(mine.filter((p) => p.pref === "avoid").map((p) => ({ other: p.to_user, at: p.created_at }))),
    gotAvoid: group(theirs.filter((p) => p.pref === "avoid").map((p) => ({ other: p.from_user, at: p.created_at }))),
    gaveBlock: group(blocks.filter((b) => b.blocker_id === userId).map((b) => ({ other: b.blocked_id, at: b.created_at }))),
    gotBlock: group(blocks.filter((b) => b.blocked_id === userId).map((b) => ({ other: b.blocker_id, at: b.created_at }))),
    gaveAgain: mine.filter((p) => p.pref === "again").length,
    gotAgain: theirs.filter((p) => p.pref === "again").length,
  };
}
export type PersonRelations = ReturnType<typeof personRelations>;

/** 화면에 이름을 띄우려고 읽어야 하는 상대 id */
export const relationIds = (r: PersonRelations) => [...new Set([...r.gaveAvoid, ...r.gotAvoid, ...r.gaveBlock, ...r.gotBlock].map((x) => x.userId))];
