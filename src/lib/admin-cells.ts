// 어드민 목록 칸 몇 개의 표기. DB를 읽지 않는 순수 함수만 둔다 (admin-cells.test.ts)
import { isMembership } from "./constants";
import { fmtDay } from "./format";

/** 결제·환불 목록의 이용권 칸. 멤버십은 횟수 제한이 없어 남은 횟수 대신 기간만 쓴다 */
export function passUsage(passType: string | null | undefined, p: { total_count: number; remaining: number; expires_at: string | null } | null): string {
  if (!p) return "-";
  const until = p.expires_at ? `${fmtDay(p.expires_at)}까지` : "";
  if (isMembership(passType) || p.total_count <= 0) return `횟수 제한 없음${until ? ` · ${until}` : ""}`;
  return `${p.total_count}회 중 ${p.remaining}회 남음${until ? ` · ${until}` : ""}`;
}

/** 테이블 목록의 단체방 칸. 해제된 테이블은 방이 남아 있어도 '해제됨'. 빈 배열은 방이 없는 것 */
export function roomCell(tableStatus: string, rooms: { id: string } | { id: string }[] | null | undefined): { text: string; tone: "ink" | "muted" | "danger" } {
  if (tableStatus === "DISSOLVED") return { text: "해제됨", tone: "muted" };
  const has = Array.isArray(rooms) ? rooms.length > 0 : !!rooms;
  return has ? { text: "생성됨", tone: "ink" } : { text: "없음", tone: "danger" };
}
