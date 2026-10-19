// 변경 이력 읽기 (화면·CSV 공통). 조건은 audit.ts의 auditQuery가 만들고, 여기서는 그대로 쿼리에 옮긴 뒤 대상 이름을 모은다
import { fmtSlot } from "./format";
import { type AuditContext, type AuditEvent, type AuditFilter, auditQuery, weightsValue } from "./audit";
import { DEFAULT_SETTINGS } from "./matching/types";
import { db } from "./supabase";
import { TEMPLATES } from "./templates";

const COLS = "id,entity_type,entity_id,field,from_value,to_value,actor,reason,created_at";

export const templateLabel = (k: string) => (TEMPLATES as Record<string, { label: string }>)[k]?.label;

/** 검색어가 사람·식당 이름이면 그 id도 찾는다 (이력 문구에 이름이 없을 때가 많아서) */
async function nameIds(q: string): Promise<string[]> {
  const [{ data: us }, { data: vs }] = await Promise.all([
    db().from("users").select("id").ilike("name", `%${q}%`).limit(50),
    db().from("venues").select("id").ilike("name", `%${q}%`).limit(50),
  ]);
  const userIds = (us ?? []).map((u) => u.id as string);
  const { data: apps } = userIds.length ? await db().from("applications").select("id").in("user_id", userIds).limit(150) : { data: [] };
  return [...userIds, ...(vs ?? []).map((v) => v.id as string), ...(apps ?? []).map((a) => a.id as string)];
}

export async function loadAudit(f: AuditFilter, limit?: number): Promise<{ rows: AuditEvent[]; total: number }> {
  const q = auditQuery(f, limit);
  let s = db().from("status_events").select(COLS, { count: "exact" });
  if (q.types) s = s.in("entity_type", q.types);
  if (q.fieldLike) s = s.like("field", q.fieldLike);
  if (q.fieldNotLike) s = s.not("field", "like", q.fieldNotLike);
  if (q.actorEq) s = s.eq("actor", q.actorEq);
  if (q.actorLike) s = s.like("actor", q.actorLike);
  if (q.since) s = s.gte("created_at", q.since);
  if (q.until) s = s.lt("created_at", q.until);
  if (q.search) {
    const ids = await nameIds(q.search);
    const like = `*${q.search}*`;
    const ors = [`reason.ilike.${like}`, `from_value.ilike.${like}`, `to_value.ilike.${like}`];
    if (ids.length) ors.push(`entity_id.in.(${ids.join(",")})`);
    s = s.or(ors.join(","));
  }
  const { data, count } = await s.order("created_at", { ascending: false }).order("id", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
  return { rows: (data ?? []) as AuditEvent[], total: count ?? 0 };
}

/** CSV용: 거르기 그대로 최대 max줄까지 1,000줄씩 나눠 읽는다 */
export async function loadAuditAll(f: AuditFilter, max = 5000): Promise<AuditEvent[]> {
  const out: AuditEvent[] = [];
  for (let page = 1; out.length < max; page++) {
    const { rows } = await loadAudit({ ...f, page }, 1000);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.slice(0, max);
}

const byType = (rows: AuditEvent[], t: string) => [...new Set(rows.filter((r) => r.entity_type === t).map((r) => r.entity_id))];

/** 한 페이지 분량 이력의 운영자 이름과 대상 이름·링크 재료 */
export async function auditContext(rows: AuditEvent[]): Promise<{ ctx: AuditContext; adminNames: Map<string, string> }> {
  const appIds = byType(rows, "application");
  const roomIds = byType(rows, "chat_room");
  const resIds = byType(rows, "reservation");
  const userIds = byType(rows, "user");
  const adminIds = [...new Set(rows.filter((r) => r.actor.startsWith("admin:") && r.actor !== "admin:demo").map((r) => r.actor.slice(6)))];
  const none = { data: [] as never[] };
  const [apps, rooms, resv, users, admins] = await Promise.all([
    appIds.length ? db().from("applications").select("id,users(name),rounds(title)").in("id", appIds) : none,
    roomIds.length ? db().from("chat_rooms").select("id,table_id").in("id", roomIds) : none,
    resIds.length ? db().from("reservations").select("id,table_id,venues(name)").in("id", resIds) : none,
    userIds.length ? db().from("users").select("id,name,role").in("id", userIds) : none,
    adminIds.length ? db().from("users").select("id,name").in("id", adminIds) : none,
  ]);
  const roomRows = (rooms.data ?? []) as { id: string; table_id: string }[];
  const resRows = (resv.data ?? []) as unknown as { id: string; table_id: string; venues: { name: string } | null }[];
  const tableIds = [...new Set([...byType(rows, "dining_table"), ...roomRows.map((r) => r.table_id), ...resRows.map((r) => r.table_id)])];
  const venueIds = byType(rows, "venue");
  const partIds = ((users.data ?? []) as { id: string; role: string }[]).filter((u) => u.role !== "admin").map((u) => u.id);
  const [tables, venues, lastApps] = await Promise.all([
    tableIds.length ? db().from("dining_tables").select("id,slots(region,starts_at),venues(name)").in("id", tableIds) : none,
    venueIds.length ? db().from("venues").select("id,name").in("id", venueIds) : none,
    partIds.length ? db().from("applications").select("id,user_id,submitted_at").in("user_id", partIds).order("submitted_at", { ascending: false }) : none,
  ]);
  const lastApp = new Map<string, string>();
  for (const a of (lastApps.data ?? []) as { id: string; user_id: string }[]) if (!lastApp.has(a.user_id)) lastApp.set(a.user_id, a.id);

  const ctx: AuditContext = {
    apps: new Map(((apps.data ?? []) as unknown as { id: string; users: { name: string } | null; rounds: { title: string } | null }[]).map((a) => [a.id, { name: a.users?.name ?? "이름 없음", round: a.rounds?.title }])),
    rooms: new Map(roomRows.map((r) => [r.id, r.table_id])),
    reservations: new Map(resRows.map((r) => [r.id, { tableId: r.table_id, venue: r.venues?.name }])),
    users: new Map(((users.data ?? []) as { id: string; name: string; role: string }[]).map((u) => [u.id, { name: u.name, role: u.role, appId: lastApp.get(u.id) }])),
    tables: new Map(((tables.data ?? []) as unknown as { id: string; slots: { region: string; starts_at: string } | null; venues: { name: string } | null }[]).map((t) => [t.id, [t.slots ? `${fmtSlot(t.slots.starts_at)} ${t.slots.region}` : `#${t.id.slice(0, 6)}`, t.venues?.name].filter(Boolean).join(" · ")])),
    venues: new Map(((venues.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name])),
    templateLabel,
  };
  return { ctx, adminNames: new Map(((admins.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name])) };
}

/** 지금 저장된 매칭 기준을 이력 값 모양(JSON)으로 */
export async function currentWeightsValue(): Promise<string> {
  const { data } = await db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const w = { ...DEFAULT_SETTINGS.weights, ...((map.get("matching.weights") as Record<string, number> | undefined) ?? {}) };
  return weightsValue(w, Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore));
}
