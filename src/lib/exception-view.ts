// 예외 처리함(/admin/exceptions) 보기 전환과 '다시 열기' 판단. DB를 읽지 않는 순수 함수만 둔다 (exception-view.test.ts)
import { cleanNote } from "./cancel-rules";

/** open=지금 처리할 것, done=처리한 것, all=모두 */
export type ExceptionView = "open" | "done" | "all";
export const EXCEPTION_VIEWS: { key: ExceptionView; label: string }[] = [
  { key: "open", label: "처리할 것" },
  { key: "done", label: "처리한 것" },
  { key: "all", label: "모두" },
];

type SP = Record<string, string | string[] | undefined>;
const pick = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};

/** v=done|all. 예전 주소 all=1 은 '모두'로 읽는다(대시보드·다른 화면 링크 호환) */
export function parseExceptionView(sp: SP): ExceptionView {
  const v = pick(sp, "v");
  if (v === "done" || v === "all") return v;
  if (pick(sp, "all") === "1") return "all";
  return "open";
}

/** 보기·유형 → 주소. 처리할 것은 v= 를 붙이지 않는다 */
export function exceptionsHref(q: { v?: ExceptionView; k?: string }): string {
  const p = new URLSearchParams();
  if (q.v && q.v !== "open") p.set("v", q.v);
  if (q.k) p.set("k", q.k);
  const s = p.toString();
  return `/admin/exceptions${s ? `?${s}` : ""}`;
}

/** DB에서 거를 상태. all이면 null */
export const viewStatus = (v: ExceptionView): "open" | "resolved" | null => (v === "open" ? "open" : v === "done" ? "resolved" : null);

/**
 * 다시 열 수 있나. 처리한 건만, 사유(4자 이상)를 적어야 연다.
 * 다시 열어도 처리하면서 바뀐 데이터(환불·제재·배정 등)는 그대로 둔다. 확인 문구에 그 점을 적는다
 */
/**
 * 다시 열 수 없는 예외와 대신 바로잡을 곳. 노쇼는 다시 열어도 참석·계정 상태가 이미 정해져 있어 정정으로 이어지지 않는다.
 * - 노쇼 후보(신청 단위): 참석 관리의 '참석 예정으로 되돌리기'
 * - 노쇼 누적 제한 검토(회원 단위, ref_type user): 회원 상세의 계정 상태 바꾸기
 */
export function reopenElsewhere(kind: string, refType?: string | null, refId?: string | null): { reason: string; href: string; label: string } | null {
  if (kind !== "no_show") return null;
  if (refType === "user")
    return { reason: "노쇼 누적 제한 검토는 다시 열지 않아요. 제한을 풀거나 걸려면 회원 상세에서 계정 상태를 바꿔 주세요", href: refId ? `/admin/members/${refId}` : "/admin/members", label: "회원 상세로" };
  return { reason: "노쇼 후보는 다시 열지 않아요. 참석을 바로잡으려면 참석 관리에서 '참석 예정으로 되돌리기'를 해 주세요", href: "/admin/attendance", label: "참석 관리로" };
}

export function canReopen(o: { status: string; note: unknown; kind?: string; refType?: string | null }): { ok: true; note: string } | { ok: false; reason: string } {
  const elsewhere = o.kind ? reopenElsewhere(o.kind, o.refType) : null;
  if (elsewhere) return { ok: false, reason: elsewhere.reason };
  if (o.status !== "resolved") return { ok: false, reason: "이미 열려 있는 예외예요" };
  const note = cleanNote(o.note);
  if (!note) return { ok: false, reason: "다시 여는 이유를 4자 이상 적어 주세요" };
  return { ok: true, note };
}

/** 다시 열기 확인 문구 */
export const reopenConfirm = (resolution: string | null | undefined) =>
  `이 예외를 다시 '처리할 것'으로 올려요. 처리하면서 바뀐 것(${resolution || "처리 결과"})은 되돌리지 않아요. 필요하면 다시 연 뒤 직접 고쳐 주세요. 계속할까요?`;

/**
 * 열린 목록 순서: 다시 연 건 → 본인이 참석했다고 알린 노쇼 후보 → 나머지(오래된 순은 DB 정렬 그대로).
 * 같은 묶음 안에서는 원래 순서를 지킨다
 */
export function sortOpenFirst<T extends { id: string }>(rows: T[], rank: (e: T) => number): T[] {
  return rows.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.e);
}

/** 위 정렬에 쓰는 점수: 다시 연 열린 건 2, 본인 참석 알림 1, 나머지 0 */
export const openRank = (e: { status: string }, reopened: boolean, claimed: boolean) => (e.status !== "open" ? 0 : reopened ? 2 : claimed ? 1 : 0);
