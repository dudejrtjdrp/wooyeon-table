// 예약 알림 정리·운영자 수정. 판단은 scheduled-rules.ts(순수 함수), 여기서는 읽고 쓰기만 한다.
// 취소는 status 'canceled'로 남긴다(마이그레이션 0013). 아직 운영 DB에 적용 전이면 지우고, 어느 쪽이든 status_events에 원래 제목·키·사유를 남긴다.
import { now } from "./clock";
import { logStatus } from "./events";
import { EDITED_STALE, type AppState, type PendingRow, type TableState, keyKind, planSync, remindAt, remindNeed, verdict } from "./scheduled-rules";
import { db } from "./supabase";
import { loadTemplates, render, slotVars } from "./templates";

type Row = PendingRow & { title: string; body: string; template: string };
const COLS = "id,user_id,template,title,body,link,dedupe_key,scheduled_at";

/** 운영자가 직접 고친 예약인지 (status_events field scheduled_edit) */
async function editedIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await db().from("status_events").select("entity_id").eq("entity_type", "notification").eq("field", "scheduled_edit").in("entity_id", ids);
  return new Set((data ?? []).map((x) => String(x.entity_id)));
}

/**
 * 이 신청의 하루 전 안내를 운영자가 '예약 취소'로 직접 거둔 적이 있는지. 같은 테이블일 때만 막는다
 * (다른 테이블로 옮기면 새 안내가 필요하다). 키에 테이블이 없던 첫 안내는 그 알림의 링크로 테이블을 본다
 */
async function adminCanceledRemind(appId: string, tableId: string): Promise<boolean> {
  const { data } = await db().from("status_events").select("entity_id,reason").eq("entity_type", "notification").eq("to_value", "canceled").like("reason", `[운영자 취소]%(remind:${appId}%`);
  for (const e of data ?? []) {
    const m = new RegExp(`\\(remind:${appId}(?::([0-9a-f-]{36}))?\\)`).exec(String(e.reason));
    if (!m) continue;
    if (m[1]) { if (m[1] === tableId) return true; continue; }
    const { data: n } = await db().from("notifications").select("link").eq("id", e.entity_id).maybeSingle();
    if (!n || n.link === `/tables/${tableId}`) return true; // 행이 지워졌으면(0013 전) 알 수 없으니 다시 걸지 않는다
  }
  return false;
}

/** 예약 한 건 취소. 이미 나갔거나 취소됐으면 false */
export async function cancelScheduled(row: { id: string; title: string; dedupe_key: string | null }, actor: string, why: string): Promise<boolean> {
  const { data: up, error } = await db().from("notifications").update({ status: "canceled", dedupe_key: null, last_error: `취소: ${why}`.slice(0, 200) }).eq("id", row.id).eq("status", "pending").select("id");
  let ok = Boolean(up?.length);
  if (error && error.code === "23514") {
    // 상태값 'canceled'가 아직 없는 DB(마이그레이션 0013 전, check 제약 위반)면 지운다. 기록은 아래 status_events에 남는다
    const { data: del } = await db().from("notifications").delete().eq("id", row.id).eq("status", "pending").select("id");
    ok = Boolean(del?.length);
  }
  if (ok) await logStatus({ entityType: "notification", entityId: row.id, field: "status", from: "pending", to: "canceled", actor, reason: `${why} · '${row.title}'${row.dedupe_key ? ` (${row.dedupe_key})` : ""}` }).catch(() => null);
  return ok;
}

async function loadState(appIds: string[]) {
  const [{ data: apps }, { data: fbs }] = await Promise.all([
    db().from("applications").select("id,user_id,application_status,match_status,attendance_status,payment_status,table_id,resolution").in("id", appIds),
    db().from("feedbacks").select("application_id").in("application_id", appIds),
  ]);
  const has = new Set((fbs ?? []).map((f) => f.application_id));
  const appMap = new Map<string, AppState>(((apps ?? []) as AppState[]).map((a) => [a.id, { ...a, hasFeedback: has.has(a.id) }]));
  const tableIds = [...new Set([...appMap.values()].map((a) => a.table_id).filter(Boolean))] as string[];
  const userIds = [...new Set([...appMap.values()].map((a) => a.user_id))];
  const [{ data: tbs }, { data: us }] = await Promise.all([
    tableIds.length ? db().from("dining_tables").select("id,status,reservation_name,slots(starts_at,region),venues(name)").in("id", tableIds) : Promise.resolve({ data: [] }),
    userIds.length ? db().from("users").select("id,deleted_at").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  type Tb = { id: string; status: string; reservation_name: string | null; slots: { starts_at: string; region: string }; venues: { name: string } | null };
  const tableMap = new Map(((tbs ?? []) as unknown as Tb[]).map((t) => [t.id, t]));
  const gone = new Set(((us ?? []) as { id: string; deleted_at: string | null }[]).filter((u) => u.deleted_at).map((u) => u.id));
  return { appMap, tableMap, gone };
}

const tableState = (t: { id: string; status: string; slots: { starts_at: string } } | undefined): TableState => (t ? { id: t.id, status: t.status, starts_at: t.slots.starts_at } : null);

/**
 * 신청들에 걸린 예약 알림을 지금 상황에 맞춘다. 상황이 바뀐 곳(취소·해제·이동·환불·식당 변경·노쇼 등)에서 부른다.
 * - 필요 없어진 예약은 취소(사유와 함께 기록), 테이블·모임 시각이 바뀐 하루 전 안내는 링크·시각·문구를 고친다
 * - 하루 전 안내가 있어야 하는데 없으면 새로 건다(빈자리 합류·대기자 수락처럼 확정 뒤 들어온 사람)
 * 실패해도 원래 작업을 막지 않도록 부르는 쪽에서 catch한다. 보내기 직전 tick이 한 번 더 같은 규칙으로 본다.
 */
export async function syncScheduled(appIds: string[], actor: string, reason: string, o: { contentChanged?: boolean } = {}): Promise<{ canceled: number; updated: number; created: number }> {
  const ids = [...new Set(appIds.filter(Boolean))];
  const res = { canceled: 0, updated: 0, created: 0 };
  if (!ids.length) return res;
  // 회차 취소처럼 많을 때는 20건씩 (조회 주소가 너무 길어지지 않게)
  if (ids.length > 20) {
    for (let i = 0; i < ids.length; i += 20) {
      const r = await syncScheduled(ids.slice(i, i + 20), actor, reason, o);
      res.canceled += r.canceled;
      res.updated += r.updated;
      res.created += r.created;
    }
    return res;
  }
  const t = await now();
  const { appMap, tableMap, gone } = await loadState(ids);
  // 신청 id가 키에 들어간 예약들 (remind:·feedback-remind:·payment_pending:·alt_remind:)
  const ors = ids.flatMap((id) => [`dedupe_key.like.remind:${id}%`, `dedupe_key.like.feedback-remind:${id}%`, `dedupe_key.like.payment_pending:${id}%`, `dedupe_key.like.alt_remind:${id}%`]).join(",");
  const [{ data: pend }, { data: sent }] = await Promise.all([
    db().from("notifications").select(COLS).eq("status", "pending").or(ors),
    db().from("notifications").select("id,dedupe_key,last_error").eq("status", "sent").or(ids.map((id) => `dedupe_key.like.remind:${id}%`).join(",")),
  ]);
  const rows = (pend ?? []) as Row[];
  const edited = await editedIds(rows.map((r) => r.id));
  const sentRows = (sent ?? []) as { id: string; dedupe_key: string | null; last_error: string | null }[];
  const sentFor = new Set(sentRows.map((s) => keyKind(s.dedupe_key).appId));
  // 이미 나간 하루 전 안내의 푸시를 다시 보내는 중인데 그사이 취소·해제됐으면 다시 보내기를 멈춘다(retryPushes는 '푸시 실패'만 다시 보낸다)
  for (const s of sentRows.filter((x) => x.last_error?.startsWith("푸시 실패"))) {
    const app = appMap.get(keyKind(s.dedupe_key).appId ?? "") ?? null;
    const need = remindNeed(app, tableState(app?.table_id ? tableMap.get(app.table_id) : undefined), t);
    if (!need.ok) {
      await db().from("notifications").update({ last_error: `푸시 중단: ${need.why}` }).eq("id", s.id).like("last_error", "푸시 실패%");
      await logStatus({ entityType: "notification", entityId: s.id, field: "push", from: "RETRYING", to: "STOPPED", actor, reason: `${need.why} (${reason})` }).catch(() => null);
    }
  }
  let tpl: Awaited<ReturnType<typeof loadTemplates>> | null = null;
  for (const appId of ids) {
    const app = appMap.get(appId) ?? null;
    const tb = app?.table_id ? tableMap.get(app.table_id) : undefined;
    const mine = rows.filter((r) => keyKind(r.dedupe_key).appId === appId).map((r) => ({ ...r, edited: edited.has(r.id) }));
    const plan = planSync(mine, app, tableState(tb), { gone: app ? gone.has(app.user_id) : false }, t, { remindSent: sentFor.has(appId), contentChanged: o.contentChanged });
    for (const c of plan.cancel) {
      const r = mine.find((x) => x.id === c.id)!;
      if (await cancelScheduled(r, actor, `${c.why} (${reason})`)) res.canceled++;
    }
    for (const u of plan.update) {
      const r = mine.find((x) => x.id === u.id)!;
      // 하루 전 안내 문구도 지금 식당·예약명으로 (운영자가 고친 문구는 그대로)
      let text: { title: string; body: string } | null = null;
      if (tb && keyKind(r.dedupe_key).kind === "remind" && !r.edited) {
        tpl ??= await loadTemplates();
        text = render("reminder", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "식당은 모임 정보에서", reservation: tb.reservation_name ?? "" }, tpl);
      }
      const { data: up } = await db().from("notifications").update({ ...u.patch, ...(text ?? {}) }).eq("id", r.id).eq("status", "pending").select("id");
      if (up?.length) {
        res.updated++;
        await logStatus({ entityType: "notification", entityId: r.id, field: "scheduled", from: `${r.scheduled_at} ${r.link ?? ""}`.trim(), to: `${u.patch.scheduled_at ?? r.scheduled_at} ${u.patch.link ?? r.link ?? ""}`.trim(), actor, reason: `예약 맞춤: ${reason}` }).catch(() => null);
      }
    }
    // 운영자가 직접 취소한 하루 전 안내는 다시 걸지 않는다 (취소하면 dedupe_key가 비어 중복 검사로는 못 막는다)
    const adminCanceled = plan.needRemind && app && tb ? await adminCanceledRemind(appId, tb.id) : false;
    if (plan.needRemind && app && tb && !adminCanceled) {
      tpl ??= await loadTemplates();
      const m = render("reminder", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "식당은 모임 정보에서", reservation: tb.reservation_name ?? "" }, tpl);
      const at = remindAt(tb.slots.starts_at);
      const { notify } = await import("./notify");
      await notify({ userId: app.user_id, template: "reminder", title: m.title, body: m.body, link: `/tables/${tb.id}`, dedupeKey: `remind:${appId}:${tb.id}`, scheduledAt: at > t ? at : t });
      res.created++;
    }
  }
  return res;
}

/** 테이블 하나가 바뀌었을 때(식당·시간·해제): 지금 앉은 사람 + 이 테이블로 예약이 걸린 사람 모두 맞춘다 */
export async function syncTable(tableId: string, actor: string, reason: string, o: { contentChanged?: boolean } = {}) {
  const [{ data: sitting }, { data: linked }] = await Promise.all([
    db().from("applications").select("id").eq("table_id", tableId),
    db().from("notifications").select("dedupe_key").eq("status", "pending").like("link", `/tables/${tableId}%`),
  ]);
  const ids = [...(sitting ?? []).map((a) => a.id), ...(linked ?? []).map((n) => keyKind(n.dedupe_key).appId).filter(Boolean)] as string[];
  return syncScheduled(ids, actor, reason, o);
}

/** 한 사람의 예약을 모두 맞춘다(탈퇴·계정 제한) */
export async function syncUser(userId: string, actor: string, reason: string) {
  const { data } = await db().from("applications").select("id").eq("user_id", userId);
  const res = await syncScheduled((data ?? []).map((a) => a.id), actor, reason);
  // 신청과 묶이지 않은 예약(공지 등)도 탈퇴면 보내지 않는다
  const { data: u } = await db().from("users").select("deleted_at").eq("id", userId).maybeSingle();
  if (u?.deleted_at) {
    const { data: rest } = await db().from("notifications").select("id,title,dedupe_key").eq("user_id", userId).eq("status", "pending");
    for (const r of rest ?? []) if (await cancelScheduled(r, actor, `탈퇴한 회원이에요 (${reason})`)) res.canceled++;
  }
  return res;
}

/** 실패해도 원래 작업은 계속한다. 예약은 보내기 직전에 한 번 더 걸러진다 */
export const quietly = <T>(p: Promise<T>) => p.catch((e) => (console.error("[scheduled] 예약 정리 실패", e), null));

/**
 * tick이 예약 알림을 보내기 직전에 부른다. 보낼 이유가 사라졌으면 skip(취소 사유), 하루 전 안내는 지금 식당·예약명·테이블로 다시 쓴 patch.
 * 운영자가 고친 예약은 문구를 덮어쓰지 않고 링크만 맞춘다.
 */
export async function checkBeforeSend(n: { id: string; dedupe_key: string | null }, tpl: Awaited<ReturnType<typeof loadTemplates>>): Promise<{ skip?: string; patch?: { title?: string; body?: string; link?: string } }> {
  const { kind, appId } = keyKind(n.dedupe_key);
  if (!appId) return {};
  const t = await now();
  const [{ appMap, tableMap, gone }, { data: row }] = await Promise.all([loadState([appId]), db().from("notifications").select(COLS).eq("id", n.id).maybeSingle()]);
  if (!row) return { skip: "알림을 찾지 못했어요" };
  const app = appMap.get(appId) ?? null;
  const tb = app?.table_id ? tableMap.get(app.table_id) : undefined;
  let edited = (await editedIds([n.id])).has(n.id);
  const v = verdict({ ...(row as Row), edited }, app, tableState(tb), { gone: app ? gone.has(app.user_id) : false }, t);
  // 운영자가 고친 문구가 옛 테이블 기준이면, 보내기 직전엔 거두는 대신 지금 내용으로 바꿔 보낸다(다시 걸 기회가 없으므로)
  if (v.action === "cancel" && v.why === EDITED_STALE) edited = false;
  else if (v.action === "cancel") return { skip: v.why };
  if (kind === "remind" && tb) {
    // 같은 신청에 하루 전 안내가 이미 나갔으면 다시 보내지 않는다
    const { data: dup } = await db().from("notifications").select("id").like("dedupe_key", `remind:${appId}%`).eq("status", "sent").neq("id", n.id).limit(1);
    if (dup?.length) return { skip: "하루 전 안내가 이미 나갔어요" };
    const link = `/tables/${tb.id}`;
    if (edited) return { patch: { link } };
    const m = render("reminder", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "식당은 모임 정보에서", reservation: tb.reservation_name ?? "" }, tpl);
    return { patch: { title: m.title, body: m.body, link } };
  }
  return {};
}
