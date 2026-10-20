// 운영자 긴급 수정 (MAT-14). 확정 뒤 취소·안전 문제 같은 예외 상황에서만 쓴다.
// 참가자 이동, 테이블 분리·병합·해제. 사유를 반드시 받고(비면 거부), 모든 변경은 status_events에 운영자 이름으로 남긴다.
// 이 수정으로 풀린 예외(같은 신청·테이블에 걸린 조건 충돌·식당 부족·예약 실패 등)는 함께 닫는다.
import { type Member, fillOrReflow, tableMembers } from "./attendance";
import { extendMembershipFor, releaseUse } from "./billing";
import { now } from "./clock";
import { logStatus } from "./events";
import { fmtDate, fmtSlot, fmtTime } from "./format";
import { canJoin } from "./matching/constraints";
import { loadRelations, loadSettings } from "./matching/runner";
import type { Candidate, MatchSettings, Relations } from "./matching/types";
import { notify } from "./notify";
import { afterConfirm, ensureRoom } from "./pipeline";
import { db } from "./supabase";
import { postSystem } from "./delivery";
import { loadTemplates, render } from "./templates";

export const ACTIVE = ["CONFIRMED", "VENUE_ASSIGNED", "READY"];
type Result = { ok: boolean; message: string };
type Tb = { id: string; status: string; round_id: string; slot_id: string; match_run_id: string | null; reservation_name: string | null; slots: { starts_at: string; region: string }; venues: { name: string } | null };

/** 사유는 비울 수 없다. 참가자 이력과 테이블 이력에 그대로 남는다 */
export const MIN_REASON = 4;
export function checkReason(reason: string | null | undefined): Result | null {
  const r = (reason ?? "").trim();
  if (!r) return { ok: false, message: "사유를 적어 주세요. 변경 이력과 참가자 이력에 그대로 남아요" };
  if (r.length < MIN_REASON) return { ok: false, message: `사유를 ${MIN_REASON}자 이상 적어 주세요` };
  return null;
}

/**
 * 긴급 수정으로 풀린 열린 예외를 닫는다. exceptionId는 예외 처리함에서 넘어온 그 건.
 * 신청에 걸린 조건 충돌·데이터 누락은 그 사람을 옮기거나 빼면 풀린다.
 * 테이블에 걸린 예외는 기본으로 조건 충돌만 닫고, 테이블이 없어지는 해제·병합 때는 식당 부족·예약 실패·공지 실패까지 닫는다.
 */
const APP_KINDS = ["condition_conflict", "data_missing"];
export const TABLE_GONE_KINDS = ["condition_conflict", "venue_shortage", "reservation", "data_missing", "notification"];
export async function closeLinked(o: { adminId: string; resolution: string; exceptionId?: string | null; appIds?: string[]; tableIds?: string[]; tableKinds?: string[] }): Promise<number> {
  const ids = new Set<string>();
  if (o.exceptionId) ids.add(o.exceptionId);
  if (o.appIds?.length) {
    const { data } = await db().from("exceptions").select("id").eq("status", "open").eq("ref_type", "application").in("ref_id", o.appIds).in("kind", APP_KINDS);
    for (const x of data ?? []) ids.add(x.id);
  }
  if (o.tableIds?.length) {
    const refs = [...o.tableIds];
    const { data: rooms } = await db().from("chat_rooms").select("id").in("table_id", o.tableIds);
    refs.push(...(rooms ?? []).map((r) => r.id));
    const { data } = await db().from("exceptions").select("id").eq("status", "open").in("ref_type", ["dining_table", "chat_room", "venue_phone"]).in("ref_id", refs).in("kind", o.tableKinds ?? ["condition_conflict"]);
    for (const x of data ?? []) ids.add(x.id);
  }
  if (!ids.size) return 0;
  const at = new Date().toISOString();
  const { data: closed } = await db().from("exceptions").update({ status: "resolved", resolution: `긴급 수정: ${o.resolution}`, resolved_by: o.adminId, resolved_at: at }).in("id", [...ids]).eq("status", "open").select("id");
  for (const x of closed ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "open", to: "resolved", actor: `admin:${o.adminId}`, reason: tag(o.resolution) });
  return closed?.length ?? 0;
}

async function table(id: string) {
  const { data } = await db().from("dining_tables").select("id,status,round_id,slot_id,match_run_id,reservation_name,slots(starts_at,region),venues(name)").eq("id", id).maybeSingle();
  return data as unknown as Tb | null;
}

const cand = (m: { id: string; user_id: string; birth_year: number; slotIds: string[] }): Candidate => ({
  applicationId: m.id, userId: m.user_id, birthYear: m.birth_year, gender: "M", mbti: null, interests: [], myTraits: [], wantedTraits: [], slotIds: m.slotIds,
});

const tag = (reason: string) => `[운영자 긴급 수정] ${reason}`;

async function say(tableId: string, body: string) {
  const room = await ensureRoom(tableId);
  await postSystem(room, body);
}

/** 옮긴 사람의 예약 안내를 새 테이블 기준으로 다시 건다 */
async function rescheduleFor(appId: string, userId: string, from: string, to: Tb) {
  await db().from("notifications").delete().eq("user_id", userId).eq("status", "pending").eq("link", `/tables/${from}`);
  await db().from("notifications").delete().eq("dedupe_key", `remind:${appId}`).eq("status", "pending");
  const at = new Date(new Date(to.slots.starts_at).getTime() - 24 * 3600_000);
  if (at > (await now())) {
    // 운영자가 '자동 메시지'에서 고친 하루 전 안내 문구를 그대로 쓴다
    const msg = render("reminder", { date: fmtDate(to.slots.starts_at), time: fmtTime(to.slots.starts_at), region: to.slots.region, venue: to.venues?.name ?? "식당은 모임 정보에서", reservation: to.reservation_name ?? "" }, await loadTemplates());
    await notify({ userId, template: "reminder", title: msg.title, body: msg.body, link: `/tables/${to.id}`, dedupeKey: `remind:${appId}:${to.id}`, scheduledAt: at });
  }
}

/** 같은 회차에서 옮길 수 있는 다른 테이블 */
export async function siblingTables(tableId: string) {
  const tb = await table(tableId);
  if (!tb) return [];
  const { data } = await db().from("dining_tables").select("id,status,slot_id,slots(starts_at,region),venues(name)").eq("round_id", tb.round_id).neq("id", tableId).in("status", ACTIVE);
  const rows = (data ?? []) as unknown as { id: string; status: string; slot_id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null }[];
  const out = [];
  for (const r of rows) out.push({ ...r, count: (await tableMembers(r.id)).length });
  return out.sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
}

/**
 * 긴급 수정은 예외 상황에서만 (MAT-14). 예외함 카드(ex)에서 들어왔으면 그대로,
 * 아니면 운영자가 '예외 상황이 맞다'고 한 번 더 확인해야 하고, 이력 사유에 [예외 없이]를 붙여 남긴다
 */
export function emergencyGate(exceptionId: string | null, acknowledged: boolean, reason: string): { ok: true; reason: string } | { ok: false; message: string } {
  if (exceptionId) return { ok: true, reason };
  if (!acknowledged) return { ok: false, message: "예외함에서 들어온 수정이 아니에요. 예외 상황이 맞다면 확인란에 체크해 주세요" };
  return { ok: true, reason: `[예외 없이] ${reason}` };
}

/** 참가자 한 명을 다른 테이블로 옮긴다 */
export async function moveMember(appId: string, targetId: string, reason: string, adminId: string, allowOtherSlot: boolean, exceptionId?: string | null): Promise<Result> {
  const bad = checkReason(reason);
  if (bad) return bad;
  reason = reason.trim();
  const actor = `admin:${adminId}`;
  const { data: a } = await db().from("applications").select("id,user_id,table_id,match_status,attendance_status").eq("id", appId).single();
  if (!a?.table_id || a.match_status !== "CONFIRMED" || a.attendance_status !== "SCHEDULED") return { ok: false, message: "확정된 참가자만 옮길 수 있어요" };
  const [from, to, settings] = await Promise.all([table(a.table_id), table(targetId), loadSettings()]);
  if (!from || !to || !ACTIVE.includes(to.status)) return { ok: false, message: "옮길 테이블이 열려 있지 않아요" };
  if (to.round_id !== from.round_id) return { ok: false, message: "같은 회차 안에서만 옮길 수 있어요" };
  const group = await tableMembers(targetId);
  if (group.length >= settings.maxSize) return { ok: false, message: `옮길 테이블이 이미 ${settings.maxSize}명이에요` };
  const me = (await tableMembers(from.id)).find((m) => m.id === appId)!;
  if (!allowOtherSlot && !me.slotIds.includes(to.slot_id)) return { ok: false, message: "참가자가 고르지 않은 일정이에요. 본인과 통화로 확인했다면 '고르지 않은 일정 허용'을 켜 주세요" };
  const rel = await loadRelations([...group.map((g) => g.user_id), me.user_id]);
  if (!canJoin(group.map(cand), cand(me), rel, settings)) return { ok: false, message: "나이 차이 또는 차단·신고 관계 때문에 그 테이블에 앉힐 수 없어요" };

  await db().from("applications").update({ table_id: targetId, match_reason: `운영팀이 ${fmtDate(to.slots.starts_at)} ${to.slots.region} 테이블로 옮겼어요.` }).eq("id", appId);
  await logStatus({ entityType: "application", entityId: appId, field: "table_id", from: from.id, to: targetId, actor, reason: tag(reason) });
  await logStatus({ entityType: "dining_table", entityId: from.id, field: "member_out", to: me.name, actor, reason: tag(reason) });
  await logStatus({ entityType: "dining_table", entityId: targetId, field: "member_in", to: me.name, actor, reason: tag(reason) });
  await say(from.id, "한 분이 운영팀 안내로 다른 테이블로 옮기게 됐어요.");
  await say(targetId, `새로운 분이 합류했어요. ${me.name}님 반가워요!`);
  await rescheduleFor(appId, me.user_id, from.id, to);
  await notify({ userId: me.user_id, template: "reallocated", title: "테이블이 바뀌었어요", body: `${fmtSlot(to.slots.starts_at)} · ${to.slots.region}`, link: `/tables/${targetId}`, dedupeKey: `admin-move:${appId}:${targetId}` });
  await fillOrReflow(from.id, actor);
  const n = await closeLinked({ adminId, resolution: `${me.name}님 이동 (${reason})`, exceptionId, appIds: [appId], tableIds: [from.id] });
  return { ok: true, message: `${me.name}님을 옮겼어요${n ? `. 관련 예외 ${n}건도 처리 완료로 닫았어요` : ""}` };
}

/** 참가자를 테이블에서 뺀다. 환불을 고르면 바로 환불하고, 아니면 다른 일정·보관·환불을 직접 고르게 한다 */
export async function removeMember(appId: string, reason: string, adminId: string, refund: boolean, exceptionId?: string | null): Promise<Result> {
  const bad = checkReason(reason);
  if (bad) return bad;
  reason = reason.trim();
  const actor = `admin:${adminId}`;
  const { data: a } = await db().from("applications").select("id,user_id,table_id,match_status,attendance_status,payment_status,users(name)").eq("id", appId).single();
  const app = a as unknown as { id: string; user_id: string; table_id: string | null; match_status: string; attendance_status: string | null; payment_status: string; users: { name: string } } | null;
  if (!app?.table_id || app.match_status !== "CONFIRMED") return { ok: false, message: "확정된 참가자만 뺄 수 있어요" };
  const tableId = app.table_id;
  await db().from("applications").update({ table_id: null, attendance_status: null, match_status: "ALTERNATIVE_OFFERED", payment_status: app.payment_status === "PAID" ? "REFUND_AVAILABLE" : app.payment_status, match_reason: "운영팀 확인으로 이번 테이블에서 빠지게 됐어요." }).eq("id", appId);
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor, reason: tag(reason) });
  await extendMembershipFor(appId, actor);
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "member_out", to: app.users.name, actor, reason: tag(reason) });
  await db().from("notifications").delete().eq("user_id", app.user_id).eq("status", "pending").eq("link", `/tables/${tableId}`);
  await db().from("seat_offers").update({ status: "void" }).eq("application_id", appId).eq("status", "pending");
  if (refund) {
    await db().from("applications").update({ payment_status: "PAID" }).eq("id", appId).eq("payment_status", "REFUND_AVAILABLE");
    await releaseUse(appId, actor, tag(reason));
    await db().from("applications").update({ match_status: "NO_MATCH", resolution: "refund" }).eq("id", appId);
    await notify({ userId: app.user_id, template: "admin_removed", title: "이번 모임은 함께하지 못하게 됐어요", body: "환불·이용권은 내 신청 화면에서 확인할 수 있어요", link: `/applications/${appId}`, dedupeKey: `admin-remove:${appId}:${tableId}` });
  } else {
    await notify({ userId: app.user_id, template: "admin_removed", title: "이번 테이블은 함께하지 못하게 됐어요", body: "다음 방법을 골라 주세요", link: `/applications/${appId}/resolve`, dedupeKey: `admin-remove:${appId}:${tableId}` });
  }
  await say(tableId, "한 분이 사정이 생겨 함께하지 못하게 됐어요.");
  await fillOrReflow(tableId, actor);
  const n = await closeLinked({ adminId, resolution: `${app.users.name}님 제외 (${reason})`, exceptionId, appIds: [appId] });
  return { ok: true, message: `${app.users.name}님을 테이블에서 뺐어요${refund ? " (환불 진행)" : ""}${n ? `. 관련 예외 ${n}건도 닫았어요` : ""}` };
}

/** 테이블을 해제한다. 참가자 전원에게 다른 일정·보관·환불을 안내한다 */
export async function dissolveTable(tableId: string, reason: string, adminId: string, exceptionId?: string | null): Promise<Result> {
  const bad = checkReason(reason);
  if (bad) return bad;
  reason = reason.trim();
  const actor = `admin:${adminId}`;
  const tb = await table(tableId);
  if (!tb || !ACTIVE.includes(tb.status)) return { ok: false, message: "이미 끝났거나 해제된 테이블이에요" };
  const ms = await tableMembers(tableId);
  await db().from("dining_tables").update({ status: "DISSOLVED" }).eq("id", tableId);
  await db().from("seat_offers").update({ status: "void" }).eq("table_id", tableId).eq("status", "pending");
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", from: tb.status, to: "DISSOLVED", actor, reason: tag(reason) });
  for (const m of ms) {
    await db().from("applications").update({ table_id: null, attendance_status: null, match_status: "ALTERNATIVE_OFFERED", payment_status: "REFUND_AVAILABLE", match_reason: "운영팀 사정으로 이번 테이블이 열리지 못하게 됐어요." }).eq("id", m.id).eq("payment_status", "PAID");
    await logStatus({ entityType: "application", entityId: m.id, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor, reason: tag(`테이블 해제: ${reason}`) });
    await extendMembershipFor(m.id, actor);
    await db().from("notifications").delete().eq("user_id", m.user_id).eq("status", "pending").eq("link", `/tables/${tableId}`);
    await notify({ userId: m.user_id, template: "alternative", title: "모임이 취소됐어요", body: "3일 안에 다음 방법을 골라 주세요", link: `/applications/${m.id}/resolve`, dedupeKey: `admin-dissolve:${m.id}:${tableId}` });
  }
  await say(tableId, "운영팀 사정으로 이번 모임이 취소됐어요. 알림에서 다음 방법을 골라 주세요. 불편을 드려 죄송해요.");
  const n = await closeLinked({ adminId, resolution: `테이블 해제 (${reason})`, exceptionId, tableIds: [tableId], tableKinds: TABLE_GONE_KINDS });
  return { ok: true, message: `테이블을 해제하고 ${ms.length}명에게 안내했어요${n ? `. 관련 예외 ${n}건도 닫았어요` : ""}` };
}

/** 이 테이블 사람들을 다른 테이블로 합친다 */
export async function mergeInto(sourceId: string, targetId: string, reason: string, adminId: string, exceptionId?: string | null): Promise<Result> {
  const bad = checkReason(reason);
  if (bad) return bad;
  reason = reason.trim();
  const actor = `admin:${adminId}`;
  const [src, dst, settings] = await Promise.all([table(sourceId), table(targetId), loadSettings()]);
  if (!src || !dst || !ACTIVE.includes(src.status) || !ACTIVE.includes(dst.status)) return { ok: false, message: "열려 있는 테이블끼리만 합칠 수 있어요" };
  if (src.slot_id !== dst.slot_id) return { ok: false, message: "같은 날짜·시간·지역 테이블끼리만 합칠 수 있어요" };
  const [a, b] = await Promise.all([tableMembers(sourceId), tableMembers(targetId)]);
  if (a.length + b.length > settings.maxSize) return { ok: false, message: `합치면 ${a.length + b.length}명이라 ${settings.maxSize}명을 넘어요` };
  const rel = await loadRelations([...a, ...b].map((m) => m.user_id));
  const group = b.map(cand);
  for (const m of a) {
    if (!canJoin(group, cand(m), rel, settings)) return { ok: false, message: `${m.name}님은 나이 차이 또는 차단·신고 관계 때문에 합칠 수 없어요` };
    group.push(cand(m));
  }
  for (const m of a) {
    await db().from("applications").update({ table_id: targetId, match_reason: "운영팀이 같은 시간 테이블과 합쳤어요." }).eq("id", m.id);
    await logStatus({ entityType: "application", entityId: m.id, field: "table_id", from: sourceId, to: targetId, actor, reason: tag(`병합: ${reason}`) });
    await rescheduleFor(m.id, m.user_id, sourceId, dst);
    await notify({ userId: m.user_id, template: "reallocated", title: "테이블이 합쳐졌어요", body: `${a.length + b.length}명이 함께해요`, link: `/tables/${targetId}`, dedupeKey: `admin-merge:${m.id}:${targetId}` });
  }
  await db().from("dining_tables").update({ status: "DISSOLVED" }).eq("id", sourceId);
  await db().from("seat_offers").update({ status: "void" }).eq("table_id", sourceId).eq("status", "pending");
  await logStatus({ entityType: "dining_table", entityId: sourceId, field: "status", from: src.status, to: "DISSOLVED", actor, reason: tag(`${targetId.slice(0, 8)} 테이블로 병합: ${reason}`) });
  await logStatus({ entityType: "dining_table", entityId: targetId, field: "merged_from", to: sourceId, actor, reason: tag(`${a.length}명 합류: ${reason}`) });
  await say(sourceId, "이 테이블은 같은 시간 다른 테이블과 합쳐졌어요. 새 단체방으로 옮겨 주세요.");
  await say(targetId, `같은 시간 테이블과 합쳐 ${a.map((m) => m.name).join(", ")}님이 합류했어요. 반가워요!`);
  for (const m of b) await notify({ userId: m.user_id, template: "reallocated", title: "새로운 분들이 합류했어요", body: `${a.length}명이 더 함께해요`, link: `/tables/${targetId}`, dedupeKey: `admin-merge-in:${m.id}:${sourceId}` });
  const n = await closeLinked({ adminId, resolution: `테이블 병합 (${reason})`, exceptionId, tableIds: [sourceId], tableKinds: TABLE_GONE_KINDS });
  return { ok: true, message: `${a.length}명을 합쳤어요${n ? `. 관련 예외 ${n}건도 닫았어요` : ""}` };
}

/** 고른 사람들을 같은 일정의 새 테이블로 나눈다. 나눈 뒤 두 테이블 모두 최소 인원 이상이어야 한다 */
export async function splitTable(tableId: string, appIds: string[], reason: string, adminId: string, exceptionId?: string | null): Promise<Result> {
  const bad = checkReason(reason);
  if (bad) return bad;
  reason = reason.trim();
  const actor = `admin:${adminId}`;
  const [tb, settings] = await Promise.all([table(tableId), loadSettings()]);
  if (!tb || !ACTIVE.includes(tb.status)) return { ok: false, message: "열려 있는 테이블만 나눌 수 있어요" };
  const ms = await tableMembers(tableId);
  const out = ms.filter((m) => appIds.includes(m.id));
  const stay = ms.length - out.length;
  if (out.length < settings.minSize || stay < settings.minSize) return { ok: false, message: `나눈 뒤 두 테이블 모두 ${settings.minSize}명 이상이어야 해요 (지금 ${stay}명 / ${out.length}명)` };
  const { data: nt } = await db()
    .from("dining_tables")
    .insert({ round_id: tb.round_id, slot_id: tb.slot_id, match_run_id: tb.match_run_id, status: "CONFIRMED", confirmed_at: (await now()).toISOString(), explanation: { reasons: ["운영팀이 조정한 테이블"], origin: "admin_split" } })
    .select("id")
    .single();
  const newTb = (await table(nt!.id))!;
  await logStatus({ entityType: "dining_table", entityId: nt!.id, field: "status", to: "CONFIRMED", actor, reason: tag(`${tableId.slice(0, 8)} 테이블에서 분리: ${reason}`) });
  for (const m of out) {
    await db().from("applications").update({ table_id: nt!.id, match_reason: "운영팀이 테이블을 둘로 나눴어요." }).eq("id", m.id);
    await logStatus({ entityType: "application", entityId: m.id, field: "table_id", from: tableId, to: nt!.id, actor, reason: tag(`분리: ${reason}`) });
    await rescheduleFor(m.id, m.user_id, tableId, newTb);
    await notify({ userId: m.user_id, template: "reallocated", title: "테이블이 나뉘었어요", body: "식당과 단체방을 확인해 주세요", link: `/tables/${nt!.id}`, dedupeKey: `admin-split:${m.id}:${nt!.id}` });
  }
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "split_to", to: nt!.id, actor, reason: tag(`${out.length}명 분리: ${reason}`) });
  await say(tableId, `운영팀 조정으로 ${out.length}분이 같은 시간 다른 테이블로 옮겼어요.`);
  await afterConfirm(nt!.id); // 식당 배정, 단체방, 첫 공지, 리마인드
  const n = await closeLinked({ adminId, resolution: `테이블 분리 (${reason})`, exceptionId, tableIds: [tableId] });
  return { ok: true, message: `${out.length}명을 새 테이블로 나눴어요${n ? `. 관련 예외 ${n}건도 닫았어요` : ""}` };
}

/** 조건 충돌 예외에 붙이는 '이 사람을 이 테이블로 옮기기' 추천 */
export type MoveSuggestion = { appId: string; name: string; targetId: string; target: string; count: number };
type Sib = { id: string; slot_id: string; members: Member[] };

/**
 * 순수 계산. 충돌한 테이블에서 옮길 사람과, 그 사람을 받아 줄 첫 테이블을 고른다.
 * preferAppId가 있으면 그 사람만 본다. 없으면 필수 조건(나이 차·차단·신고·비선호)을 깨는 사람을 나이가 가운데서 먼 순으로 본다.
 * 받는 테이블은 인원이 남고, 그 사람이 고른 일정이고, canJoin을 통과해야 한다. moveMember도 같은 검사를 한 번 더 한다.
 */
export function pickMove(members: Member[], siblings: Sib[], rel: Relations, settings: MatchSettings, preferAppId?: string | null): { mover: Member; target: Sib } | null {
  let movers: Member[];
  if (preferAppId) movers = members.filter((m) => m.id === preferAppId);
  else {
    const years = members.map((m) => m.birth_year).sort((a, b) => a - b);
    const mid = years[Math.floor(years.length / 2)] ?? 0;
    movers = members
      .filter((m) => !canJoin(members.filter((o) => o.id !== m.id).map(cand), cand(m), rel, settings))
      .sort((a, b) => Math.abs(b.birth_year - mid) - Math.abs(a.birth_year - mid));
  }
  for (const mover of movers)
    for (const t of siblings) {
      if (t.members.length >= settings.maxSize || !mover.slotIds.includes(t.slot_id)) continue;
      if (canJoin(t.members.map(cand), cand(mover), rel, settings)) return { mover, target: t };
    }
  return null;
}

/** 조건 충돌 예외(신청 또는 테이블 기준)에서 바로 누를 수 있는 이동 추천. 받아 줄 테이블이 없으면 null */
export async function suggestMove(ex: { ref_type: string; ref_id: string }): Promise<MoveSuggestion | null> {
  let tableId: string | null = null;
  let prefer: string | null = null;
  if (ex.ref_type === "application") {
    const { data } = await db().from("applications").select("table_id,match_status").eq("id", ex.ref_id).maybeSingle();
    if (!data?.table_id || data.match_status !== "CONFIRMED") return null;
    tableId = data.table_id;
    prefer = ex.ref_id;
  } else if (ex.ref_type === "dining_table") tableId = ex.ref_id;
  if (!tableId) return null;
  const tb = await table(tableId);
  if (!tb || !ACTIVE.includes(tb.status)) return null;
  const { data: rows } = await db().from("dining_tables").select("id,status,slot_id,slots(starts_at,region),venues(name)").eq("round_id", tb.round_id).neq("id", tableId).in("status", ACTIVE);
  const others = ((rows ?? []) as unknown as { id: string; slot_id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null }[]).sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const [members, settings, ...groups] = await Promise.all([tableMembers(tableId), loadSettings(), ...others.map((o) => tableMembers(o.id))]);
  const siblings: Sib[] = others.map((o, i) => ({ id: o.id, slot_id: o.slot_id, members: groups[i] }));
  const rel = await loadRelations([...new Set([...members, ...siblings.flatMap((s) => s.members)].map((m) => m.user_id))]);
  const pick = pickMove(members, siblings, rel, settings, prefer);
  if (!pick) return null;
  const o = others.find((x) => x.id === pick.target.id)!;
  return {
    appId: pick.mover.id, name: pick.mover.name, targetId: o.id, count: pick.target.members.length,
    target: `${fmtDate(o.slots.starts_at)} ${fmtTime(o.slots.starts_at)} ${o.slots.region}${o.venues ? ` ${o.venues.name}` : ""}`,
  };
}
