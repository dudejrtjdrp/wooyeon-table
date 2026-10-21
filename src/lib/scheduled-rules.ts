// 예약 알림(아직 안 나간 notifications.status = pending) 정리 규칙. DB를 읽지 않는 순수 함수 (scheduled-rules.test.ts)
// 상황이 바뀌면(취소·해제·이동·환불·회차 취소·식당/시간 변경·탈퇴·노쇼) 어떤 예약을 지우고 어떤 예약을 고칠지 여기서 정한다.
// 같은 판단을 '바뀐 순간'(syncScheduled)과 '보내기 직전'(tick)에서 함께 쓴다.

export type ScheduledKind = "remind" | "feedback_remind" | "payment_pending" | "alt_remind" | "other";

/** 중복 방지 키에서 예약 종류와 신청 id를 읽는다 */
export function keyKind(key: string | null | undefined): { kind: ScheduledKind; appId: string | null } {
  const k = key ?? "";
  const [head, appId] = k.split(":");
  const kind: ScheduledKind =
    head === "remind" ? "remind" : head === "feedback-remind" ? "feedback_remind" : head === "payment_pending" ? "payment_pending" : head === "alt_remind" ? "alt_remind" : "other";
  return { kind, appId: kind === "other" ? null : appId || null };
}

/** 예약 종류 이름 (운영자 화면) */
export const SCHEDULED_LABEL: Record<ScheduledKind, string> = {
  remind: "하루 전 안내",
  feedback_remind: "별점 다시 요청",
  payment_pending: "결제 안내",
  alt_remind: "다른 방법 고르기 알림",
  other: "예약 알림",
};

export type PendingRow = { id: string; user_id: string; dedupe_key: string | null; link: string | null; scheduled_at: string; edited?: boolean };

export type AppState = {
  id: string;
  user_id: string;
  application_status: string;
  match_status: string;
  attendance_status: string | null;
  payment_status: string;
  table_id: string | null;
  resolution: string | null;
  hasFeedback?: boolean;
};

export type TableState = { id: string; status: string; starts_at: string } | null;

export type UserState = { gone: boolean };

export const OPEN_TABLE = ["CONFIRMED", "VENUE_ASSIGNED", "READY"];
const DAY = 24 * 3600_000;

/** 하루 전 안내를 보낼 시각. 모임 24시간 전 */
export const remindAt = (startsAt: string) => new Date(Date.parse(startsAt) - DAY);

export type Verdict =
  | { action: "keep" }
  | { action: "cancel"; why: string }
  | { action: "update"; patch: { scheduled_at?: string; link?: string } };

/** 하루 전 안내가 지금 필요한지. 필요 없으면 그 까닭 */
export function remindNeed(app: AppState | null, table: TableState, now: Date): { ok: true } | { ok: false; why: string } {
  if (!app) return { ok: false, why: "신청이 없어졌어요" };
  if (app.application_status === "CANCELED") return { ok: false, why: "신청이 취소됐어요" };
  if (app.attendance_status === "CANCELED_EARLY" || app.attendance_status === "CANCELED_LATE") return { ok: false, why: "참석을 취소했어요" };
  if (app.attendance_status === "NO_SHOW") return { ok: false, why: "노쇼로 처리됐어요" };
  if (app.match_status !== "CONFIRMED" || app.attendance_status !== "SCHEDULED" || !app.table_id) return { ok: false, why: "확정된 테이블이 없어요(해제·제외·다른 방법 고르기)" };
  if (!table || table.id !== app.table_id) return { ok: false, why: "테이블을 찾지 못했어요" };
  if (!OPEN_TABLE.includes(table.status)) return { ok: false, why: table.status === "DISSOLVED" ? "테이블이 해제됐어요" : "모임이 이미 시작했거나 끝났어요" };
  if (Date.parse(table.starts_at) <= now.getTime()) return { ok: false, why: "모임이 이미 시작했어요" };
  return { ok: true };
}

/**
 * 예약 한 건을 지금 상황에서 어떻게 할지.
 * - 하루 전 안내: 확정·참석 예정·열린 테이블일 때만. 테이블이 바뀌었으면 링크를, 모임 시각이 바뀌었으면 보낼 시각을 맞춘다
 *   (운영자가 직접 고친 예약은 시각을 건드리지 않는다)
 * - 후기 다시 요청: 참석했고 아직 후기가 없을 때만
 * - 결제 안내: 신청이 살아 있고 결제 전(PENDING·FAILED)일 때만
 * - 다른 방법 고르기 알림: 아직 매칭 실패 안내 상태이고 고른 게 없을 때만
 * - 그 밖에 /tables/<id>로 가는 예약인데 그 사람이 더는 그 테이블에 없으면 지운다
 */
export function verdict(row: PendingRow, app: AppState | null, table: TableState, user: UserState, now: Date): Verdict {
  if (user.gone) return { action: "cancel", why: "탈퇴한 회원이에요" };
  const { kind } = keyKind(row.dedupe_key);
  if (kind !== "other" && (!app || app.user_id !== row.user_id)) return { action: "cancel", why: "신청이 없어졌어요" };
  if (kind === "remind") {
    const need = remindNeed(app, table, now);
    if (!need.ok) return { action: "cancel", why: need.why };
    const patch: { scheduled_at?: string; link?: string } = {};
    const link = `/tables/${app!.table_id}`;
    if (row.link !== link) patch.link = link;
    const at = remindAt(table!.starts_at);
    // 이미 시각이 지났으면(확정이 하루 안에 난 경우) 그대로 둔다: 다음 tick에 바로 나간다
    if (!row.edited && at.getTime() > now.getTime() && Math.abs(Date.parse(row.scheduled_at) - at.getTime()) > 60_000) patch.scheduled_at = at.toISOString();
    return Object.keys(patch).length ? { action: "update", patch } : { action: "keep" };
  }
  if (kind === "feedback_remind") {
    if (app!.attendance_status !== "ATTENDED") return { action: "cancel", why: "참석 기록이 없어요(노쇼·취소)" };
    if (app!.hasFeedback) return { action: "cancel", why: "이미 후기를 남겼어요" };
    return { action: "keep" };
  }
  if (kind === "payment_pending") {
    if (app!.application_status === "CANCELED") return { action: "cancel", why: "신청이 취소됐어요" };
    if (!["PENDING", "FAILED"].includes(app!.payment_status)) return { action: "cancel", why: "이미 결제했거나 환불됐어요" };
    return { action: "keep" };
  }
  if (kind === "alt_remind") {
    if (app!.match_status !== "ALTERNATIVE_OFFERED" || app!.resolution) return { action: "cancel", why: "이미 다음 방법을 골랐어요" };
    return { action: "keep" };
  }
  // 종류를 모르는 예약: 테이블로 가는 링크인데 지금 그 테이블에 없으면 보내지 않는다
  const m = /^\/tables\/([0-9a-f-]{36})(?:$|\/)/.exec(row.link ?? "");
  if (m && app && app.table_id !== m[1] && !row.link!.endsWith("/feedback")) return { action: "cancel", why: "이제 그 테이블에 있지 않아요" };
  return { action: "keep" };
}

/**
 * 한 신청에 걸린 예약 여러 건을 한꺼번에 본다. 같은 종류가 두 건 이상이면(이동하며 다시 건 하루 전 안내 등)
 * 가장 최근 것만 남기고 나머지는 지운다. 하루 전 안내가 필요한데 하나도 없으면 needRemind.
 */
export function planSync(
  rows: PendingRow[],
  app: AppState | null,
  table: TableState,
  user: UserState,
  now: Date,
  o: { remindSent?: boolean } = {},
): { cancel: { id: string; why: string }[]; update: { id: string; patch: { scheduled_at?: string; link?: string } }[]; needRemind: boolean } {
  const cancel: { id: string; why: string }[] = [];
  const update: { id: string; patch: { scheduled_at?: string; link?: string } }[] = [];
  const seen = new Set<ScheduledKind>();
  // 최근에 예약한 것부터 본다 (id 순서는 의미가 없어 scheduled_at이 같으면 입력 순서)
  const sorted = [...rows].sort((a, b) => (b.edited ? 1 : 0) - (a.edited ? 1 : 0) || Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));
  for (const r of sorted) {
    const v = verdict(r, app, table, user, now);
    const { kind } = keyKind(r.dedupe_key);
    if (v.action === "cancel") {
      cancel.push({ id: r.id, why: v.why });
      continue;
    }
    if (kind !== "other" && seen.has(kind)) {
      cancel.push({ id: r.id, why: "같은 안내가 두 번 예약돼 있었어요" });
      continue;
    }
    seen.add(kind);
    if (v.action === "update") update.push({ id: r.id, patch: v.patch });
  }
  if (o.remindSent && seen.has("remind")) {
    for (const r of sorted) if (keyKind(r.dedupe_key).kind === "remind" && !cancel.some((c) => c.id === r.id)) cancel.push({ id: r.id, why: "하루 전 안내가 이미 나갔어요" });
    for (let i = update.length - 1; i >= 0; i--) if (cancel.some((c) => c.id === update[i].id)) update.splice(i, 1);
  }
  const needRemind = !user.gone && !o.remindSent && !seen.has("remind") && remindNeed(app, table, now).ok;
  return { cancel, update, needRemind };
}

// ── 운영자 수정 ─────────────────────────────────────

export const SCHEDULED_TITLE_MAX = 60;
export const SCHEDULED_BODY_MAX = 500;

/** 운영자가 예약 알림을 고칠 때 값 검사. 보낼 시각은 지금보다 뒤, 모임이 있으면 모임 시작 전 */
export function checkScheduledEdit(o: { title: string; body: string; at: string | null; reason: string; now: Date; startsAt?: string | null }):
  | { ok: true; title: string; body: string; at: string; reason: string }
  | { ok: false; message: string } {
  const title = o.title.trim();
  const body = o.body.trim();
  const reason = o.reason.trim();
  if (!title) return { ok: false, message: "제목을 적어 주세요" };
  if (title.length > SCHEDULED_TITLE_MAX) return { ok: false, message: `제목은 ${SCHEDULED_TITLE_MAX}자까지 적을 수 있어요` };
  if (!body) return { ok: false, message: "본문을 적어 주세요" };
  if (body.length > SCHEDULED_BODY_MAX) return { ok: false, message: `본문은 ${SCHEDULED_BODY_MAX}자까지 적을 수 있어요` };
  if (!o.at) return { ok: false, message: "보낼 시각을 골라 주세요" };
  if (Date.parse(o.at) <= o.now.getTime()) return { ok: false, message: "보낼 시각은 지금보다 뒤여야 해요" };
  if (o.startsAt && Date.parse(o.at) >= Date.parse(o.startsAt)) return { ok: false, message: "보낼 시각은 모임 시작 전이어야 해요" };
  if (reason.length < 4) return { ok: false, message: "사유를 4자 이상 적어 주세요. 변경 이력에 그대로 남아요" };
  return { ok: true, title, body, at: o.at, reason };
}

/** 참가자 '예정된 안내'에서 누르면 갈 곳: 바꾸거나 취소할 수 있는 화면 */
export function scheduledTarget(row: { dedupe_key: string | null; link: string | null }): { href: string; cta: string } | null {
  const { kind, appId } = keyKind(row.dedupe_key);
  if (kind === "remind" && appId) return { href: `/applications/${appId}`, cta: "일정 바꾸기·취소" };
  if (kind === "payment_pending" && appId) return { href: row.link ?? `/pay/${appId}`, cta: "결제하기" };
  if (kind === "feedback_remind") return row.link ? { href: row.link, cta: "별점 남기기" } : null;
  if (kind === "alt_remind" && appId) return { href: `/applications/${appId}/resolve`, cta: "다음 방법 고르기" };
  return row.link ? { href: row.link, cta: "자세히" } : null;
}
