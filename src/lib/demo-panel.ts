// 심사용 시연 패널과 대시보드 기본 회차 규칙 (DB 없이 계산만)
import { MIN_TABLE } from "./sim/join";

/** 패널 동작 뒤 돌아갈 주소. 보던 회차(r)와 패널 펼침(demo=1)을 그대로 지킨다 */
export function adminBackUrl(msg: string, opts: { r?: string | null; demo?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.r) q.set("r", opts.r);
  if (opts.demo) q.set("demo", "1");
  q.set("m", msg);
  return `/admin?${q.toString()}${opts.demo ? "#demo" : ""}`;
}

type RoundLite = { id: string; status: string; match_at: string; apply_deadline?: string | null };

/**
 * 대시보드 기본 회차(주소에 r이 없을 때): 지금 모집 중인 회차(마감이 가장 가까운 것) → 아직 매칭 전인 회차 → 가장 최근 회차.
 * rounds는 match_at 오름차순. 다른 화면(roundsAndCurrent)의 기본값은 그대로 둔다
 */
export function pickDashboardRound<T extends RoundLite>(rounds: T[], now: Date, r?: string | null): T | undefined {
  const asked = r ? rounds.find((x) => x.id === r) : undefined;
  if (asked) return asked;
  const open = rounds.filter((x) => x.status === "open");
  const recruiting = open.find((x) => new Date(x.apply_deadline ?? x.match_at) > now);
  return recruiting ?? open[0] ?? rounds[rounds.length - 1];
}

/** 시연 참가자(사람) 계정: is_demo이고 테스트 참가자(test-…)가 아닌 계정. 010… 휴대폰 번호 아이디 */
export const isDemoHuman = (u: { login_id?: string | null; is_demo?: boolean | null } | null | undefined) =>
  Boolean(u?.is_demo) && !(u?.login_id ?? "").startsWith("test-");

/**
 * 일정마다 최소 인원(4명)까지 몇 명을 더 넣어야 하는지.
 * 여러 일정을 고른 사람은 다른 일정으로 갈 수 있어 1/고른 일정 수만큼만 센다(lib/sim/join botsNeeded와 같은 방식).
 * 신청자가 한 명도 없는 일정은 채우지 않는다
 */
export function fillNeeds(apps: { slots: string[] }[], min = MIN_TABLE): Map<string, number> {
  const mass = new Map<string, number>();
  for (const a of apps) for (const s of a.slots) mass.set(s, (mass.get(s) ?? 0) + 1 / Math.max(1, a.slots.length));
  const out = new Map<string, number>();
  for (const [s, m] of mass) {
    const need = Math.max(0, min - Math.floor(m + 1e-9));
    if (need) out.set(s, need);
  }
  return out;
}

/** 시연 패널 머리줄의 '적용 회차' 한 줄 */
export function demoHeaderLine(roundLabel: string, t: Date, offsetSeconds: number, fmt: (d: Date) => string): string {
  return `적용 회차: ${roundLabel} · ${offsetSeconds ? `시연용 가상 시각 ${fmt(t)}` : `실제 시각 ${fmt(t)}`}`;
}
