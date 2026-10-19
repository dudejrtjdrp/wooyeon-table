// 자동 메시지 화면: 발송 이력 거르기·쪽 나누기, 다시 보내기 대상, 운영자 공지의 대상 고르기·문구 검사.
// DB를 읽지 않는 순수 함수만 둔다 (notice-rules.test.ts)
import { cleanQuery } from "./audit";

// ── 발송 이력 ─────────────────────────────────────────
export const LOG_PAGE_SIZE = 30;
export const LOG_STATUS = { sent: "보냄", pending: "예약", failed: "실패" } as const;
export type LogStatus = keyof typeof LOG_STATUS;

export interface LogFilter {
  /** 받는 사람 이름 */
  q?: string;
  /** notifications.template */
  tpl?: string;
  st?: LogStatus;
  /** YYYY-MM-DD (서울 날짜, 그날 포함) */
  from?: string;
  to?: string;
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string | undefined) => (d && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00+09:00`)) ? d : undefined);

export function parseLogFilter(sp: Record<string, string | string[] | undefined>, templates: Set<string>): LogFilter {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tpl = one("tpl");
  const st = one("st");
  let from = validDay(one("from"));
  let to = validDay(one("to"));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: cleanQuery(one("q"))?.slice(0, 20),
    tpl: tpl && templates.has(tpl) ? tpl : undefined,
    st: st && st in LOG_STATUS ? (st as LogStatus) : undefined,
    from,
    to,
    page: Math.max(1, Math.min(10000, Math.floor(Number(one("page")) || 1))),
  };
}

/** 거르기 조건을 주소 뒤에 붙일 문자열로. page를 주면 그 쪽으로 */
export function logSearch(f: LogFilter, page = f.page): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tpl) p.set("tpl", f.tpl);
  if (f.st) p.set("st", f.st);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** 서울 날짜 범위를 조회 조건으로 (to는 그날 끝까지) */
export function logRange(f: Pick<LogFilter, "from" | "to">): { since?: string; until?: string } {
  return {
    since: f.from ? new Date(`${f.from}T00:00:00+09:00`).toISOString() : undefined,
    until: f.to ? new Date(Date.parse(`${f.to}T00:00:00+09:00`) + 86_400_000).toISOString() : undefined,
  };
}

export const pageCount = (total: number, size = LOG_PAGE_SIZE) => Math.max(1, Math.ceil(total / size));

/** 실패한 알림: 알림함에 못 넣었거나(failed), 알림함엔 들어갔지만 푸시가 안 나간 것 */
export const isFailedNotice = (n: { status: string; last_error: string | null }) => n.status === "failed" || Boolean(n.status === "sent" && n.last_error?.startsWith("푸시 실패"));

// ── 운영자 공지 ───────────────────────────────────────
export const NOTICE_SCOPES = { round: "회차 신청자", table: "테이블", member: "회원 한 명" } as const;
export type NoticeScope = keyof typeof NOTICE_SCOPES;
export const parseScope = (v: unknown): NoticeScope | null => {
  const s = String(v ?? "");
  return s in NOTICE_SCOPES ? (s as NoticeScope) : null;
};

export const NOTICE_TITLE_MAX = 30;
export const NOTICE_BODY_MAX = 60;
const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** 공지 문구 검사. 알림은 한 줄 요약이라(2026-10-17 결정) 줄바꿈은 빈칸으로 바꾸고 길이를 묶는다 */
export function cleanNotice(title: unknown, body: unknown): { ok: true; title: string; body: string } | { ok: false; message: string } {
  const t = oneLine(title);
  const b = oneLine(body);
  if (t.length < 2) return { ok: false, message: "공지 제목을 2자 이상 적어 주세요" };
  if (t.length > NOTICE_TITLE_MAX) return { ok: false, message: `공지 제목은 ${NOTICE_TITLE_MAX}자까지예요` };
  if (b.length < 4) return { ok: false, message: "공지 내용을 4자 이상 적어 주세요" };
  if (b.length > NOTICE_BODY_MAX) return { ok: false, message: `공지 내용은 ${NOTICE_BODY_MAX}자까지예요. 자세한 건 단체방이나 화면 안내로 나눠 주세요` };
  return { ok: true, title: t, body: b };
}

export type NoticeRow = {
  user_id: string;
  application_status?: string | null;
  match_status?: string | null;
  attendance_status?: string | null;
  deleted_at?: string | null;
};

/**
 * 공지를 받을 사람. 한 사람은 한 번만, 탈퇴한 사람은 뺀다.
 * - 회차 신청자: 신청서를 낸 사람(작성 중·취소 빼고)
 * - 테이블: 지금 그 테이블에 확정된 사람(빠졌거나 참석을 취소한 사람 빼고)
 * - 회원 한 명: 그 사람
 */
export function noticeRecipients(scope: NoticeScope, rows: NoticeRow[]): string[] {
  const keep = (r: NoticeRow) => {
    if (r.deleted_at) return false;
    if (scope === "round") return r.application_status === "SUBMITTED";
    if (scope === "table") return r.match_status === "CONFIRMED" && r.application_status !== "CANCELED" && !r.attendance_status?.startsWith("CANCELED");
    return true;
  };
  return [...new Set(rows.filter(keep).map((r) => r.user_id))];
}

/** 짧은 해시 (FNV-1a 32비트). 같은 문구인지 가리는 데만 쓴다 */
export function noticeHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 같은 대상에게 같은 공지는 한 번만 나가게 하는 키 (notifications.dedupe_key) */
export const noticeKey = (scope: NoticeScope, targetId: string, title: string, body: string, userId: string) =>
  `announce:${scope}:${targetId}:${noticeHash(`${title}\n${body}`)}:${userId}`;

/** 공지를 눌렀을 때 갈 곳. 테이블 공지는 그 테이블, 나머지는 알림함 */
export const noticeLink = (scope: NoticeScope, targetId: string) => (scope === "table" ? `/tables/${targetId}` : "/notifications");

/** 화면에서 본 받는 사람 수와 보낼 때 다시 센 수가 다르면 보내지 않는다 */
export function noticeSendCheck(expected: unknown, recipients: string[]): { ok: true } | { ok: false; message: string } {
  if (!recipients.length) return { ok: false, message: "받을 사람이 없어요" };
  if (String(recipients.length) !== String(expected ?? "")) return { ok: false, message: `그 사이 받는 사람이 ${recipients.length}명으로 바뀌었어요. 다시 확인하고 보내 주세요` };
  return { ok: true };
}
