import { type Candidate, type MatchSettings, type Relations, pairKey } from "./types";

/** 이 사람을 그룹에 더해도 필수 조건(나이·제외 관계)을 지키는지. 인원·일정은 엔진에서 따로 본다 */
export function canJoin(
  group: Candidate[],
  c: Candidate,
  rel: Relations,
  settings: MatchSettings,
): boolean {
  if (group.some((m) => m.userId === c.userId)) return false;
  const years = [...group.map((m) => m.birthYear), c.birthYear];
  if (Math.max(...years) - Math.min(...years) > settings.maxAgeGap) return false;
  for (const m of group) if (rel.excluded.has(pairKey(m.userId, c.userId))) return false;
  return true;
}

export type Violation =
  | "size"
  | "slot"
  | "age"
  | "excluded"
  | "duplicate";

/** 확정 직전 테이블 전체를 다시 검증한다 (MAT-07) */
export function validateTable(
  members: Candidate[],
  slotId: string,
  rel: Relations,
  settings: MatchSettings,
): Violation[] {
  const v: Violation[] = [];
  if (members.length < settings.minSize || members.length > settings.maxSize) v.push("size");
  if (members.some((m) => !m.slotIds.includes(slotId))) v.push("slot");
  const years = members.map((m) => m.birthYear);
  if (years.length && Math.max(...years) - Math.min(...years) > settings.maxAgeGap) v.push("age");
  outer: for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (rel.excluded.has(pairKey(members[i].userId, members[j].userId))) {
        v.push("excluded");
        break outer;
      }
    }
  }
  if (new Set(members.map((m) => m.userId)).size !== members.length) v.push("duplicate");
  return v;
}
