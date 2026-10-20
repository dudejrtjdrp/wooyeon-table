// 매칭 모니터의 테이블별 차단·신고·비선호 충돌 세기 (DB 없이 계산만)
import { pairKey } from "./matching/types";

export type AvoidPref = { from_user: string; to_user: string; table_id: string | null };
export type TableConflicts = { block: number; report: number; avoid: number; total: number; reflected: number };

/**
 * 같은 테이블 사람 쌍마다 차단·신고·비선호를 센다.
 * 끝난 테이블(DONE)에서 그 테이블 후기로 남긴 '다시는 싫어요'는 충돌이 아니라 다음 매칭에 반영될 기록이라 reflected로 따로 센다
 * (같은 쌍에 다른 테이블에서 생긴 비선호가 있으면 그건 충돌로 남긴다)
 */
export function tableConflicts(
  table: { id: string; status: string },
  userIds: string[],
  rel: { block: Set<string>; report: Set<string> },
  avoids: AvoidPref[],
): TableConflicts {
  const done = table.status === "DONE";
  const fromHere = new Set<string>();
  const other = new Set<string>();
  for (const a of avoids) (done && a.table_id === table.id ? fromHere : other).add(pairKey(a.from_user, a.to_user));
  const c = { block: 0, report: 0, avoid: 0, total: 0, reflected: 0 };
  for (let i = 0; i < userIds.length; i++)
    for (let j = i + 1; j < userIds.length; j++) {
      const k = pairKey(userIds[i], userIds[j]);
      if (rel.block.has(k)) c.block++;
      if (rel.report.has(k)) c.report++;
      if (other.has(k)) c.avoid++;
      else if (fromHere.has(k)) c.reflected++;
    }
  c.total = c.block + c.report + c.avoid;
  return c;
}

/** 테이블 점수 표시: 큰 숫자는 최소 점수와 비교하는 확정 판정 점수, 총점은 풀이로 */
export function scoreDisplay(score: number, gate: number | null | undefined): { main: number; total: number; differs: boolean } {
  const total = Math.round(Number(score));
  const main = typeof gate === "number" && Number.isFinite(gate) ? Math.round(gate) : total;
  return { main, total, differs: main !== total };
}

/** 점수 풀이: 확정 판정 점수와 총점이 다르면 총점을 여기에 적는다 */
export function scoreTip(sc: { total: number; differs: boolean }, base: string): string {
  return sc.differs
    ? `${base} 보이는 숫자는 최소 점수와 비교하는 확정 판정 점수예요(성비 감점 제외). 성비 감점과 총점에만 들어가는 가점·감점까지 넣은 총점은 ${sc.total}점이에요.`
    : `${base} 이 점수가 최소 점수 이상이면 자동으로 확정해요.`;
}
