// 운영자가 모집 중인 회차를 고치거나 취소할 때의 판단. DB를 읽지 않는 순수 함수라 테스트로 고정한다.
// 마감 규칙: 신청 마감은 모임 주 화요일 24:00(환불 마감)보다 늦으면 안 된다 (docs/prd/08-qna.md, lib/policy.ts)
import { fmtSlot } from "./format";
import { refundCutoff, roundCutoff } from "./policy";

const KST = 9 * 3600_000;

/** ISO → datetime-local 칸 값(서울 시각) "2026-10-20T23:59" */
export const toKstInput = (iso: string) => new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 16);

/** datetime-local 칸 값(서울 시각) → ISO. 형식이 틀리면 null */
export function fromKstInput(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type RoundFields = { title: string; deadline: string; matchAt: string };
export type RoundChange = { field: "title" | "apply_deadline" | "match_at"; label: string; from: string; to: string; fromText: string; toText: string };
export type RoundEditCheck = { errors: string[]; warnings: string[]; changes: RoundChange[] };

/**
 * 회차 이름·신청 마감·자동 매칭 시각을 바꿔도 되는지 본다.
 * - 모집 중일 때만, 매칭 시각이 이미 지났으면 곧 매칭이 도니 막는다
 * - 신청 마감은 지금보다 뒤, 가장 이른 모임의 환불 마감(화요일 24:00)보다 늦을 수 없다
 * - 자동 매칭은 신청 마감과 같거나 뒤, 첫 모임 시작 전
 */
export function checkRoundEdit(o: { status: string; before: RoundFields; after: RoundFields; slotStarts: string[]; now: Date }): RoundEditCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { before, after } = o;
  if (o.status !== "open") return { errors: ["모집 중인 회차만 고칠 수 있어요"], warnings, changes: [] };
  if (new Date(before.matchAt) <= o.now) return { errors: ["매칭 시각이 지나 곧 매칭이 돌아요. 지금은 고칠 수 없어요"], warnings, changes: [] };

  const title = after.title.trim();
  if (!title) errors.push("회차 이름을 채워 주세요");
  if (title.length > 40) errors.push("회차 이름은 40자까지 쓸 수 있어요");

  const dl = new Date(after.deadline);
  const ma = new Date(after.matchAt);
  if (Number.isNaN(dl.getTime()) || Number.isNaN(ma.getTime())) {
    errors.push("마감·매칭 시각을 날짜와 시간까지 넣어 주세요");
    return { errors, warnings, changes: [] };
  }
  const cut = roundCutoff(o.slotStarts);
  const first = o.slotStarts.length ? Math.min(...o.slotStarts.map((s) => new Date(s).getTime())) : null;
  const deadlineMoved = dl.getTime() !== new Date(before.deadline).getTime();
  const matchMoved = ma.getTime() !== new Date(before.matchAt).getTime();

  if (deadlineMoved && dl <= o.now) errors.push("신청 마감은 지금보다 뒤여야 해요");
  if (deadlineMoved && cut && dl > cut) errors.push(`신청 마감은 환불 마감(${fmtSlot(cut.toISOString())})보다 늦을 수 없어요. 그 뒤에 낸 신청은 환불이 안 되기 때문이에요`);
  if (ma < dl) errors.push("자동 매칭은 신청 마감과 같거나 뒤여야 해요");
  if (matchMoved && ma <= o.now) errors.push("자동 매칭 시각은 지금보다 뒤여야 해요");
  if (first !== null && ma.getTime() >= first) errors.push(`자동 매칭은 첫 모임(${fmtSlot(new Date(first).toISOString())}) 전이어야 해요`);
  // 막지는 않지만 알려 줄 것
  if (cut && ma < cut && matchMoved) warnings.push("매칭 결과가 환불 마감 전에 나가요. 결과를 보고 취소·환불하는 사람이 생길 수 있어요");
  if (deadlineMoved && dl < new Date(before.deadline)) warnings.push("마감을 앞당기면 그 사이에 신청하려던 사람은 신청할 수 없어요");
  if (first !== null && matchMoved && first - ma.getTime() < 24 * 3600_000 && ma.getTime() < first) warnings.push("매칭 뒤 첫 모임까지 하루가 안 남아 식당 예약이 빠듯해요");

  const changes: RoundChange[] = [];
  if (title && title !== before.title) changes.push({ field: "title", label: "이름", from: before.title, to: title, fromText: before.title, toText: title });
  if (deadlineMoved) changes.push({ field: "apply_deadline", label: "신청 마감", from: new Date(before.deadline).toISOString(), to: dl.toISOString(), fromText: fmtSlot(before.deadline), toText: fmtSlot(dl.toISOString()) });
  if (matchMoved) changes.push({ field: "match_at", label: "자동 매칭", from: new Date(before.matchAt).toISOString(), to: ma.toISOString(), fromText: fmtSlot(before.matchAt), toText: fmtSlot(ma.toISOString()) });
  if (!errors.length && !changes.length) errors.push("바뀐 내용이 없어요");
  return { errors, warnings, changes };
}

/** 회차 취소는 모집 중이고 매칭이 돌기 전일 때만 */
export function canCancelRound(o: { status: string; hasMatchRun: boolean; matchAt: string; now: Date; canceled?: boolean }): { ok: true; resume?: boolean } | { ok: false; reason: string } {
  // 이미 취소를 시작한 회차(closed + 이력 canceled)는 중간에 끊겨 남은 신청이 있으면 이어서 정리할 수 있다. 시각과 상관없이 된다(이미 닫혀 매칭이 돌지 않는다)
  if (o.status === "closed" && o.canceled) return { ok: true, resume: true };
  if (o.status !== "open") return { ok: false, reason: "모집 중인 회차만 취소할 수 있어요" };
  if (o.hasMatchRun) return { ok: false, reason: "이미 매칭이 돌아 회차를 취소할 수 없어요. 테이블별로 처리해 주세요" };
  // 매칭 시각이 지났으면 스케줄러가 곧 매칭을 돌린다. 둘이 엇갈리지 않게 막는다
  if (new Date(o.matchAt) <= o.now) return { ok: false, reason: "매칭 시각이 지나 곧 매칭이 돌아요. 지금은 취소할 수 없어요" };
  return { ok: true };
}

/** 일정 삭제: 모집 중, 신청자 없음, 일정이 하나만 남은 회차는 안 됨 */
export function canDeleteSlot(o: { status: string; applicants: number; slotCount: number }): { ok: true } | { ok: false; reason: string } {
  if (o.status !== "open") return { ok: false, reason: "모집 중인 회차의 일정만 지울 수 있어요" };
  if (o.applicants > 0) return { ok: false, reason: `신청자가 ${o.applicants}명 있어 지울 수 없어요. 신청자에게 다른 일정을 안내하거나 회차를 취소해 주세요` };
  if (o.slotCount <= 1) return { ok: false, reason: "일정이 하나뿐이라 지울 수 없어요. 회차를 접으려면 회차를 취소해 주세요" };
  return { ok: true };
}

export const MAX_TABLES_LIMIT = 20;

/** 일정 추가: 날짜·시각·동네가 맞는지, 이미 있는 일정과 겹치지 않는지, 마감 규칙과 어긋나지 않는지 */
export function checkSlotAdd(o: {
  status: string;
  startsAt: string | null;
  region: string;
  maxTables: number;
  openRegions: readonly string[];
  existing: { startsAt: string; region: string }[];
  deadline: string;
  matchAt: string;
  now: Date;
}): string[] {
  if (o.status !== "open") return ["모집 중인 회차에만 일정을 더할 수 있어요"];
  const errors: string[] = [];
  if (!o.openRegions.includes(o.region)) errors.push("지금 운영하는 서울 네 동네 중에서 골라 주세요");
  if (!Number.isInteger(o.maxTables) || o.maxTables < 1 || o.maxTables > MAX_TABLES_LIMIT) errors.push(`최대 테이블 수는 1~${MAX_TABLES_LIMIT} 사이로 넣어 주세요`);
  if (!o.startsAt) return [...errors, "날짜와 시작 시각을 넣어 주세요"];
  const start = new Date(o.startsAt);
  if (start <= o.now) errors.push("지난 날짜에는 일정을 만들 수 없어요");
  if (start <= new Date(o.matchAt)) errors.push("모임은 자동 매칭 뒤여야 해요");
  // 이 일정의 환불 마감이 회차 신청 마감보다 빠르면, 마감 전 신청자가 환불 마감 뒤에 결제하게 된다
  else if (refundCutoff(start) < new Date(o.deadline)) errors.push(`이 날짜의 환불 마감(${fmtSlot(refundCutoff(start).toISOString())})이 회차 신청 마감보다 빨라요. 다음 주 날짜를 고르거나 신청 마감을 먼저 앞당겨 주세요`);
  if (o.existing.some((s) => s.region === o.region && new Date(s.startsAt).getTime() === start.getTime())) errors.push("같은 날짜·시각·동네 일정이 이미 있어요");
  return errors;
}

/** 일정별 최대 테이블 수 고치기 */
export function checkMaxTables(o: { status: string; maxTables: number }): string | null {
  if (o.status !== "open") return "모집 중인 회차만 고칠 수 있어요";
  if (!Number.isInteger(o.maxTables) || o.maxTables < 1 || o.maxTables > MAX_TABLES_LIMIT) return `최대 테이블 수는 1~${MAX_TABLES_LIMIT} 사이로 넣어 주세요`;
  return null;
}
