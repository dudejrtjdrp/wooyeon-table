// 모임이 끝났는지: 홈·단체방 탭·모임 정보가 같은 기준을 쓰게 한 곳에 둔다
// 테이블이 '모임 끝'(DONE)이거나 끝나는 시각이 지났으면 지난 모임
export function meetingEnded(t: { status?: string | null; slots?: { ends_at?: string | null; starts_at?: string | null } | null } | null | undefined, now: Date): boolean {
  if (!t) return false;
  if (t.status === "DONE") return true;
  const end = t.slots?.ends_at ? Date.parse(t.slots.ends_at) : t.slots?.starts_at ? Date.parse(t.slots.starts_at) + 150 * 60_000 : NaN;
  return Number.isFinite(end) && end <= now.getTime();
}
