// 발송 실패 재시도 (INF-08)
//
// 알림은 세 갈래로 나간다: 앱 알림함, 휴대폰 푸시, 단체방 시스템 메시지.
// 이 파일은 푸시와 단체방을 맡고, 알림함 저장 재시도는 notify.ts(즉시 알림)와 pipeline.ts tick(예약 알림)에 있다.
// 실패하면 이력을 남기고, 스케줄러가 10분 간격으로 다시 보낸다. 같은 건이 3번 실패하면 그때만 운영자 예외 큐로 넘긴다.
//  - 푸시: notifications.attempts / last_error에 실패 횟수와 사유, status_events(entity notification, field push)에 매번 한 줄
//  - 단체방: status_events(entity chat_room, field system_message)에 실패마다 한 줄(다시 보낼 내용 포함). 성공하면 SENT 한 줄
import { logStatus } from "./events";
import { db } from "./supabase";

export const MAX_TRIES = 3;
export const RETRY_GAP_MIN = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Meta = Record<string, unknown>;
type Payload = { key: string; body: string; meta: Meta; error?: string };

async function insertSystem(roomId: string, p: Payload): Promise<string | null> {
  try {
    const { error } = await db()
      .from("chat_messages")
      .upsert({ room_id: roomId, kind: "system", body: p.body, meta: p.meta, dedupe_key: p.key }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function chatFailures(key: string): Promise<number> {
  const { count } = await db()
    .from("status_events")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "chat_room")
    .eq("field", "system_message")
    .eq("to_value", "FAILED")
    .like("reason", `{"key":"${key}"%`);
  return count ?? 0;
}

/**
 * 단체방 시스템 메시지를 올린다. 같은 키는 한 번만 올라간다.
 * 실패하면 0.4초 뒤 한 번 더 해 보고, 그래도 안 되면 실패 이력을 남겨 스케줄러가 다시 보내게 한다.
 */
export async function postSystem(roomId: string, body: string, opts: { dedupeKey?: string; meta?: Meta; retry?: boolean } = {}): Promise<boolean> {
  const p: Payload = { key: opts.dedupeKey ?? `sys:${crypto.randomUUID()}`, body, meta: opts.meta ?? {} };
  let err = await insertSystem(roomId, p);
  if (err) {
    await sleep(400);
    err = await insertSystem(roomId, p);
  }
  if (!err) {
    if (opts.retry) await logStatus({ entityType: "chat_room", entityId: roomId, field: "system_message", to: "SENT", actor: "system", reason: JSON.stringify({ key: p.key }) }).catch(() => null);
    return true;
  }
  await logStatus({ entityType: "chat_room", entityId: roomId, field: "system_message", to: "FAILED", actor: "system", reason: JSON.stringify({ ...p, error: err }) }).catch(() => null);
  const tries = await chatFailures(p.key).catch(() => 0);
  if (tries >= MAX_TRIES) {
    await db().from("exceptions").upsert(
      { kind: "notification", ref_type: "chat_room", ref_id: roomId, reason: `단체방 안내를 ${MAX_TRIES}번 올리지 못했어요: "${body.slice(0, 40)}${body.length > 40 ? "…" : ""}" (${err})`, dedupe_key: `chat:${p.key}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }
  return false;
}

/** 스케줄러: 하루 안에 실패한 단체방 메시지 중 아직 안 올라간 것을 다시 올린다 */
export async function retrySystemMessages(nowMs = Date.now()): Promise<number> {
  const since = new Date(nowMs - 24 * 3600_000).toISOString();
  const { data } = await db()
    .from("status_events")
    .select("entity_id,reason,created_at")
    .eq("entity_type", "chat_room")
    .eq("field", "system_message")
    .eq("to_value", "FAILED")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(300);
  const byKey = new Map<string, { roomId: string; p: Payload; tries: number; last: number }>();
  for (const e of data ?? []) {
    let p: Payload;
    try {
      p = JSON.parse(e.reason ?? "");
    } catch {
      continue;
    }
    const cur = byKey.get(p.key);
    byKey.set(p.key, { roomId: e.entity_id, p, tries: (cur?.tries ?? 0) + 1, last: Date.parse(e.created_at) });
  }
  const keys = [...byKey.keys()];
  if (!keys.length) return 0;
  const { data: posted } = await db().from("chat_messages").select("dedupe_key").in("dedupe_key", keys);
  const done = new Set((posted ?? []).map((r) => r.dedupe_key));
  let n = 0;
  for (const [key, f] of byKey) {
    if (done.has(key) || f.tries >= MAX_TRIES) continue;
    if (nowMs - f.last < RETRY_GAP_MIN * 60_000) continue;
    await postSystem(f.roomId, f.p.body, { dedupeKey: key, meta: f.p.meta, retry: true });
    n++;
  }
  return n;
}

/** 운영자가 예외 화면에서 다시 보내기: 단체방 메시지 */
export async function resendSystem(exceptionKey: string): Promise<boolean> {
  const key = exceptionKey.replace(/^chat:/, "");
  const { data } = await db()
    .from("status_events")
    .select("entity_id,reason")
    .eq("entity_type", "chat_room")
    .eq("field", "system_message")
    .eq("to_value", "FAILED")
    .like("reason", `{"key":"${key}"%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const p = JSON.parse(data.reason ?? "{}") as Payload;
  return postSystem(data.entity_id, p.body, { dedupeKey: key, meta: p.meta, retry: true });
}

/** 푸시 실패를 기록한다. 3번째 실패면 예외 큐로 */
export async function recordPushFailure(n: { id: string; user_id: string; title: string; attempts: number | null }, error: string) {
  const attempts = (n.attempts ?? 0) + 1;
  await db().from("notifications").update({ attempts, last_error: `푸시 실패: ${error}` }).eq("id", n.id);
  await logStatus({ entityType: "notification", entityId: n.id, field: "push", from: String(attempts - 1), to: "FAILED", actor: "system", reason: error }).catch(() => null);
  if (attempts >= MAX_TRIES) {
    await db().from("exceptions").upsert(
      { kind: "notification", ref_type: "notification", ref_id: n.id, reason: `'${n.title}' 푸시를 ${MAX_TRIES}번 보내지 못했어요. 앱 알림함에는 들어가 있어요 (${error})`, dedupe_key: `push:${n.id}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }
}

/** 재시도 끝에 푸시가 나갔을 때 */
export async function recordPushRecovered(n: { id: string; attempts: number | null }) {
  await db().from("notifications").update({ last_error: null }).eq("id", n.id);
  await logStatus({ entityType: "notification", entityId: n.id, field: "push", from: String(n.attempts ?? 0), to: "SENT", actor: "system", reason: "다시 보내기 성공" }).catch(() => null);
}

/** 스케줄러: 하루 안에 푸시가 실패한 알림을 10분·20분 간격으로 다시 보낸다 */
export async function retryPushes(nowMs = Date.now()): Promise<number> {
  const since = new Date(nowMs - 24 * 3600_000).toISOString();
  const { data } = await db()
    .from("notifications")
    .select("id,attempts,sent_at")
    .eq("status", "sent")
    .like("last_error", "푸시 실패%")
    .lt("attempts", MAX_TRIES)
    .gte("sent_at", since)
    .limit(100);
  const due = (data ?? []).filter((r) => nowMs >= Date.parse(r.sent_at) + (r.attempts ?? 0) * RETRY_GAP_MIN * 60_000).map((r) => r.id);
  if (!due.length) return 0;
  const { pushNotifications } = await import("./push");
  await pushNotifications(due);
  return due.length;
}

/**
 * 운영자가 알림 한 건을 다시 보낸다 (자동 메시지 화면에서. 예외 처리함의 '다시 보내기'와 같은 방식).
 * 알림함 저장이 실패했던 알림(failed)은 알림함에 넣고, 푸시도 다시 보낸다. 등록 기기가 없거나 알림함 전용 알림이면 알림함만으로 성공.
 * 성공하면 이 알림 때문에 열려 있던 발송 실패 예외도 닫는다
 */
export async function resendNotification(id: string, adminId: string): Promise<boolean> {
  const { now } = await import("./clock");
  const t = (await now()).toISOString();
  const { data: before } = await db().from("notifications").select("status,sent_at").eq("id", id).maybeSingle();
  if (!before) return false;
  const { error } = await db()
    .from("notifications")
    .update({ status: "sent", sent_at: before.status === "sent" ? before.sent_at : t, last_error: null })
    .eq("id", id);
  if (error) return false;
  const { pushNotifications } = await import("./push");
  await pushNotifications([id]);
  const { data: n } = await db().from("notifications").select("status,last_error").eq("id", id).maybeSingle();
  const ok = n?.status === "sent" && !n.last_error;
  if (ok) {
    const resolution = "자동 메시지 화면에서 다시 보내기 성공";
    const { data: closed } = await db()
      .from("exceptions")
      .update({ status: "resolved", resolution, resolved_by: adminId, resolved_at: t })
      .eq("kind", "notification")
      .eq("ref_type", "notification")
      .eq("ref_id", id)
      .eq("status", "open")
      .select("id");
    for (const x of closed ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "open", to: "resolved", actor: `admin:${adminId}`, reason: resolution }).catch(() => null);
  }
  return ok;
}
