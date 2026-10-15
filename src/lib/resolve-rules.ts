// 매칭 실패 뒤 규칙 중 DB 없이 계산되는 부분 (테스트하려고 따로 둔다)
import { neighborsOf, sidoOf } from "./regions";

/** 실패 안내 뒤 아무것도 고르지 않으면 이용권으로 보관하기까지 (성효님 확인 2026-10-16) */
export const AUTO_KEEP_AFTER = 3 * 86400_000;
/** 자리 나면 알려 주기는 모임 2일 전까지 (환불 기준과 같게, 성효님 확인 2026-10-16) */
export const WAIT_CUTOFF = 2 * 86400_000;
/** 이 규칙을 켠 날. 그 전에 실패한 신청은 이날부터 3일을 센다(미리 알리지 않고 바로 보관하지 않도록) */
export const RULE_FROM = new Date("2026-10-17T00:00:00+09:00");

/** 3일을 세기 시작하는 시각 */
export const countFrom = (failed: Date) => (failed < RULE_FROM ? RULE_FROM : failed);

/** 자리 나면 알려 주기 마감: 고른 일정 중 가장 늦은 모임의 2일 전. 1시간도 안 남았으면 고를 수 없다 */
export function waitDeadline(starts: string[], at: Date): Date | null {
  const last = Math.max(0, ...starts.map((s) => new Date(s).getTime()));
  if (!last) return null;
  const until = last - WAIT_CUTOFF;
  return until > at.getTime() + 3600_000 ? new Date(until) : null;
}

export type MoveTag = "고른 동네" | "옆 동네" | "조금 멀어요";

/** 옮길 일정의 태그. 고른 동네 → 바로 옆 동네 → 같은 시·도. 다른 시·도는 추천하지 않는다(null) */
export function moveTag(region: string, sido: string | null, liked: string[]): MoveTag | null {
  if (liked.includes(region)) return "고른 동네";
  if (neighborsOf(liked).includes(region)) return "옆 동네";
  const sidos = new Set(liked.map((a) => sidoOf(a)).filter(Boolean));
  return sidos.has(sido ?? sidoOf(region) ?? "") ? "조금 멀어요" : null;
}

export const TAG_RANK: Record<MoveTag, number> = { "고른 동네": 0, "옆 동네": 1, "조금 멀어요": 2 };

/** 무응답 처리 단계: 하루 남았을 때 한 번 알리고, 3일이 지나면 보관 */
export function noAnswerStep(failed: Date, at: Date): "keep" | "remind" | null {
  const age = at.getTime() - countFrom(failed).getTime();
  if (age >= AUTO_KEEP_AFTER) return "keep";
  if (age >= AUTO_KEEP_AFTER - 86400_000) return "remind";
  return null;
}
