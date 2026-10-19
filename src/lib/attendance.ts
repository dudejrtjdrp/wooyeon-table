// 확정 뒤 참가 취소와, 인원이 모자란 테이블의 자동 재배치 (PRD 15장 "확정 후 1명 취소")
import { extendMembershipFor, releaseUse } from "./billing";
import { now } from "./clock";
import { logStatus } from "./events";
import { fmtClock, fmtSlot } from "./format";
import { canJoin } from "./matching/constraints";
import { loadRelations, loadSettings } from "./matching/runner";
import type { Candidate } from "./matching/types";
import { notify } from "./notify";
import { ensureRoom } from "./pipeline";
import { cancelRule } from "./cancel-rules";
import { neighborsOf } from "./regions";
import { db } from "./supabase";
import { postSystem } from "./delivery";
import { type ReflowMember, planReflow } from "./reflow-rules";
import { loadTemplates, render, slotVars } from "./templates";

const KST = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const sameDay = (iso: string, at: Date) => KST(new Date(iso)) === KST(at);

export { cancelRule, type CancelRule } from "./cancel-rules";

export type Member = {
  id: string;
  user_id: string;
  birth_year: number;
  slotIds: string[];
  name: string;
  /** 재배치 점수 재검사용 (reflow-rules.ts) */
  profile?: { gender: "M" | "F"; mbti: string | null; interests: string[]; my_traits: string[]; wanted_traits: string[] };
};

type ProfileCols = { birth_year: number; gender?: "M" | "F"; mbti?: string | null; interests?: string[] | null; my_traits?: string[] | null; wanted_traits?: string[] | null };

export async function tableMembers(tableId: string): Promise<Member[]> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,users(name,profiles(birth_year,gender,mbti,interests,my_traits,wanted_traits)),application_slots(slot_id)")
    .eq("table_id", tableId)
    .eq("match_status", "CONFIRMED")
    .eq("attendance_status", "SCHEDULED");
  return ((data ?? []) as unknown as { id: string; user_id: string; users: { name: string; profiles: ProfileCols | ProfileCols[] | null }; application_slots: { slot_id: string }[] }[]).map((a) => {
    const p = Array.isArray(a.users.profiles) ? a.users.profiles[0] : a.users.profiles;
    return {
      id: a.id,
      user_id: a.user_id,
      birth_year: p?.birth_year ?? 0,
      slotIds: a.application_slots.map((s) => s.slot_id),
      name: a.users.name,
      profile: p?.gender ? { gender: p.gender, mbti: p.mbti ?? null, interests: p.interests ?? [], my_traits: p.my_traits ?? [], wanted_traits: p.wanted_traits ?? [] } : undefined,
    };
  });
}

export const toCand = (m: Member): Candidate => ({
  applicationId: m.id, userId: m.user_id, birthYear: m.birth_year, gender: "M", mbti: null, interests: [], myTraits: [], wantedTraits: [], slotIds: m.slotIds,
});

/** 참가자가 확정된 모임을 취소한다 */
export async function cancelAttendance(appId: string, userId: string): Promise<{ ok: boolean; message: string }> {
  return cancelConfirmed(appId, { actor: `user:${userId}`, ownerId: userId, reason: "참가자 취소" });
}

/**
 * 확정된 모임 취소의 본체. 참가자 본인 취소와 운영자 대리 취소가 같은 규칙(cancelRule)과 같은 뒷정리(환불·빈자리 제안·재배치)를 쓴다.
 * ownerId를 주면 그 사람의 신청일 때만 된다. byAdmin이면 참가자 알림 문구를 '운영팀이 취소했어요'로 바꾼다.
 */
export async function cancelConfirmed(
  appId: string,
  opts: { actor: string; reason: string; ownerId?: string; byAdmin?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,table_id,match_status,attendance_status,dining_tables(id,status,slots(starts_at))")
    .eq("id", appId)
    .maybeSingle();
  const a = data as unknown as { id: string; user_id: string; table_id: string | null; match_status: string; attendance_status: string | null; dining_tables: { id: string; status: string; slots: { starts_at: string } } | null } | null;
  if (!a || (opts.ownerId && a.user_id !== opts.ownerId)) return { ok: false, message: "취소할 수 없는 신청이에요" };
  if (a.match_status !== "CONFIRMED" || a.attendance_status !== "SCHEDULED" || !a.dining_tables) return { ok: false, message: "이미 처리된 신청이에요" };
  const userId = a.user_id;
  const { actor } = opts;
  const t = await now();
  const rule = cancelRule(a.dining_tables.slots.starts_at, t);
  if (rule.kind === "blocked") return { ok: false, message: rule.message };

  const to = rule.kind === "early" ? "CANCELED_EARLY" : "CANCELED_LATE";
  const tableId = a.dining_tables.id;
  // 조건부: 두 번 눌러도 한 번만
  const { data: up } = await db().from("applications").update({ attendance_status: to, table_id: null }).eq("id", appId).eq("attendance_status", "SCHEDULED").select("id");
  if (!up?.length) return { ok: false, message: "이미 처리된 신청이에요" };
  await logStatus({ entityType: "application", entityId: appId, field: "attendance_status", from: "SCHEDULED", to, actor, reason: `${opts.reason} (테이블 ${tableId.slice(0, 8)})` });
  // 이 사람에게 예약해 둔 이 테이블 안내는 보내지 않는다
  await db().from("notifications").delete().eq("user_id", userId).eq("status", "pending").eq("link", `/tables/${tableId}`);

  let body: string;
  if (rule.kind === "early") body = await releaseUse(appId, actor, opts.byAdmin ? `${opts.reason}, 환불 마감 전` : "환불 마감 전 취소");
  else body = "환불 마감(모임 주 화요일 밤 12시)이 지나 환불 없이 취소됐어요.";
  await notify({
    userId,
    template: "attendance_canceled",
    title: opts.byAdmin ? "운영팀이 참석을 취소했어요" : "참석을 취소했어요",
    body: rule.kind === "early" ? "환불은 내 신청 화면에서 확인할 수 있어요" : "환불 마감이 지나 환불 없이 취소됐어요",
    link: `/applications/${appId}`,
    dedupeKey: `attendance_canceled:${appId}`,
  });

  const roomId = await ensureRoom(tableId);
  await postSystem(roomId, "한 분이 사정이 생겨 함께하지 못하게 됐어요.");
  // 빈자리는 먼저 대기자에게 묻고, 받을 사람이 없을 때만 남은 인원으로 정리한다 (STA-07)
  await fillOrReflow(tableId, actor);
  return { ok: true, message: body };
}

/**
 * 인원이 4명 아래로 줄어든 테이블을 정리한다.
 * 남은 사람을 같은 회차에서 본인이 고른 일정의 다른 확정 테이블로 옮기고(나이·제외 조건은 그대로 지킴, reflow-rules.ts planReflow),
 * 옮길 곳이 없는 사람에게는 매칭 실패와 같은 선택지(다른 일정·보관·환불)를 준다.
 * 자동으로 옮겨진 사람도 그 테이블이 싫으면 '다른 방법 고르기'(declineReallocation)로 매칭 실패 화면에 갈 수 있다.
 */
export async function reflowTable(tableId: string, actor: string) {
  const settings = await loadSettings();
  const members = await tableMembers(tableId);
  if (members.length >= settings.minSize) return { moved: 0, offered: 0 };

  const { data: tbRaw } = await db().from("dining_tables").select("id,round_id,slot_id,slots(starts_at,region)").eq("id", tableId).single();
  const tb = tbRaw as unknown as { id: string; round_id: string; slot_id: string; slots: { starts_at: string; region: string } } | null;
  const t = await now();
  const { data: others } = await db()
    .from("dining_tables")
    .select("id,slot_id,slots(starts_at,region)")
    .eq("round_id", tb!.round_id)
    .neq("id", tableId)
    .in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY"]);
  const targetRows = (others ?? []) as unknown as { id: string; slot_id: string; slots: { starts_at: string; region: string } }[];
  const groups = new Map<string, Member[]>();
  for (const o of targetRows) groups.set(o.id, await tableMembers(o.id));
  const rel = await loadRelations([...members, ...[...groups.values()].flat()].map((m) => m.user_id));
  const asRule = (m: Member): ReflowMember => ({
    id: m.id, userId: m.user_id, birthYear: m.birth_year, slotIds: m.slotIds,
    gender: m.profile?.gender, mbti: m.profile?.mbti, interests: m.profile?.interests, myTraits: m.profile?.my_traits, wantedTraits: m.profile?.wanted_traits,
  });
  const plan = planReflow(
    members.map(asRule),
    targetRows.map((o) => ({ id: o.id, slotId: o.slot_id, startsAt: o.slots.starts_at, region: o.slots.region, members: groups.get(o.id)!.map(asRule) })),
    rel,
    settings,
    { region: tb!.slots.region, startsAt: tb!.slots.starts_at },
    t,
  );
  const tpl = await loadTemplates();

  let moved = 0;
  let offered = 0;
  for (const step of plan) {
    const m = members.find((x) => x.id === step.appId)!;
    const target = targetRows.find((o) => o.id === step.targetId);
    if (target) {
      await db().from("applications").update({ table_id: target.id, match_reason: `함께하기로 한 분이 빠져 ${fmtSlot(target.slots.starts_at)} ${target.slots.region} 테이블로 옮겼어요.` }).eq("id", m.id);
      const { data: cur } = await db().from("applications").select("realloc_count").eq("id", m.id).single();
      await db().from("applications").update({ realloc_count: (cur?.realloc_count ?? 0) + 1 }).eq("id", m.id);
      await logStatus({ entityType: "application", entityId: m.id, field: "match_status", from: "CONFIRMED", to: "CONFIRMED", actor, reason: `인원 부족으로 다른 테이블 재배치 (${tableId.slice(0, 8)} → ${target.id.slice(0, 8)})` });
      // 예전 테이블 안내(하루 전 리마인드 등)는 보내는 순간 새 테이블로 다시 쓰이고, 남은 예전 링크 알림은 지운다
      await db().from("notifications").delete().eq("user_id", m.user_id).eq("status", "pending").eq("link", `/tables/${tableId}`).not("dedupe_key", "like", "remind:%");
      const room = await ensureRoom(target.id);
      await postSystem(room, `새로운 분이 합류했어요. ${m.name}님 반가워요!`);
      const msg = render("reallocated", { ...slotVars(target.slots.starts_at), region: target.slots.region }, tpl);
      // 링크는 신청 내역: 새 테이블로 가는 버튼과 '다른 방법 고르기'가 함께 있다
      await notify({ userId: m.user_id, template: "reallocated", title: msg.title, body: msg.body, link: `/applications/${m.id}`, dedupeKey: `reflow:${m.id}:${target.id}` });
      moved++;
    } else {
      await db().from("applications").update({ table_id: null, match_status: "ALTERNATIVE_OFFERED", payment_status: "REFUND_AVAILABLE", match_reason: "함께하기로 한 분이 빠져 테이블 인원이 모자라요. 고르신 일정 안에서 조건에 맞는 다른 테이블도 없었어요." }).eq("id", m.id).eq("payment_status", "PAID");
      await logStatus({ entityType: "application", entityId: m.id, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor, reason: "확정 후 취소로 인원 부족, 옮길 테이블 없음" });
      await extendMembershipFor(m.id, actor);
      await notify({ userId: m.user_id, template: "alternative", title: "이번 모임이 열리지 못하게 됐어요", body: "3일 안에 다음 방법을 골라 주세요", link: `/applications/${m.id}/resolve`, dedupeKey: `reflow-alt:${m.id}` });
      offered++;
    }
  }
  await db().from("dining_tables").update({ status: "DISSOLVED" }).eq("id", tableId);
  await db().from("seat_offers").update({ status: "void" }).eq("table_id", tableId).eq("status", "pending");
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", to: "DISSOLVED", actor, reason: `인원 부족 해제: ${moved}명 재배치, ${offered}명 대안 안내` });
  return { moved, offered };
}

/** 자동으로 옮겨진 테이블인지 (재배치 알림이 이 테이블로 나갔는지) */
export async function wasReallocatedTo(appId: string, tableId: string): Promise<boolean> {
  const { data } = await db().from("notifications").select("id").eq("dedupe_key", `reflow:${appId}:${tableId}`).maybeSingle();
  return Boolean(data);
}

/**
 * 시스템이 옮겨 준 테이블이 마음에 들지 않을 때: 그 테이블에서 빠지고 매칭 실패와 같은 선택지(빈자리·다른 일정·기다리기·보관·환불)로 간다.
 * 본인이 고른 게 아니라서 환불 마감이 지났어도 고를 수 있다. 모임이 시작되면 안 된다.
 * 성공하면 resolve 화면으로 보내면 된다(/applications/[id]/resolve).
 */
export async function declineReallocation(appId: string, userId: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await db().from("applications").select("id,user_id,table_id,match_status,attendance_status,payment_status").eq("id", appId).maybeSingle();
  if (!data || data.user_id !== userId) return { ok: false, message: "찾을 수 없는 신청이에요" };
  if (data.match_status !== "CONFIRMED" || data.attendance_status !== "SCHEDULED" || !data.table_id) return { ok: false, message: "이미 처리된 신청이에요" };
  const tableId: string = data.table_id;
  if (!(await wasReallocatedTo(appId, tableId))) return { ok: false, message: "직접 고른 테이블은 신청 취소로 처리해 주세요" };
  const tb = await tableInfo(tableId);
  const t = await now();
  if (!tb || t >= new Date(tb.slots.starts_at)) return { ok: false, message: "모임이 이미 시작됐어요" };

  const { data: up } = await db()
    .from("applications")
    .update({ table_id: null, attendance_status: null, match_status: "ALTERNATIVE_OFFERED", payment_status: data.payment_status === "PAID" ? "REFUND_AVAILABLE" : data.payment_status, match_reason: "옮겨 드린 테이블 대신 다른 방법을 고르기로 했어요." })
    .eq("id", appId)
    .eq("match_status", "CONFIRMED")
    .eq("attendance_status", "SCHEDULED")
    .select("id");
  if (!up?.length) return { ok: false, message: "이미 처리된 신청이에요" };
  const actor = `user:${userId}`;
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor, reason: `자동 재배치된 테이블(${tableId.slice(0, 8)}) 대신 다른 방법 고르기` });
  if (data.payment_status === "PAID") await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUND_AVAILABLE", actor, reason: "자동 재배치 거절로 환불 선택 가능" });
  await extendMembershipFor(appId, "system");
  await db().from("notifications").delete().eq("user_id", userId).eq("status", "pending").like("dedupe_key", `remind:${appId}%`);
  const room = await ensureRoom(tableId);
  await postSystem(room, "한 분이 사정이 생겨 함께하지 못하게 됐어요.");
  // 빠진 자리는 대기자에게 먼저 묻고, 인원이 모자라지면 정리한다
  await fillOrReflow(tableId, actor);
  return { ok: true, message: "다른 방법을 골라 주세요. 3일 안에 고르지 않으면 이용권으로 보관해 드려요." };
}

// ─────────────────────────────────────────────
// 대기자 자동 전환 (STA-07)
// 확정 테이블에 빈자리가 생기면 같은 회차에서 매칭되지 못한 사람 중 그 일정을 골랐고 조건(나이·제외 관계)이 맞는
// 사람에게 먼저 신청한 순서대로 한 명씩 참가 의사를 묻는다. 응답 기한이 지나거나 거절하면 다음 사람에게 넘어간다.
// ─────────────────────────────────────────────

export const ACTIVE_TABLE = ["CONFIRMED", "VENUE_ASSIGNED", "READY"];
/** 응답 기한: 지금부터 6시간, 다만 모임 3시간 전을 넘지 않는다 */
const OFFER_WINDOW = 6 * 3600_000;
export const OFFER_CUTOFF = 3 * 3600_000;

export type TableInfo = { id: string; status: string; round_id: string; slot_id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null };

export async function tableInfo(tableId: string) {
  const { data } = await db().from("dining_tables").select("id,status,round_id,slot_id,slots(starts_at,region),venues(name)").eq("id", tableId).maybeSingle();
  return data as unknown as TableInfo | null;
}

type Waiter = Member & { submitted_at: string };

/** 이 테이블 빈자리를 받을 수 있는 대기자 (먼저 신청한 순) */
export async function seatCandidates(tableId: string): Promise<Waiter[]> {
  const tb = await tableInfo(tableId);
  if (!tb) return [];
  const settings = await loadSettings();
  const group = await tableMembers(tableId);
  const { data: asked } = await db().from("seat_offers").select("application_id").eq("table_id", tableId);
  const skip = new Set((asked ?? []).map((o) => o.application_id));
  const { data } = await db()
    .from("applications")
    .select("id,user_id,submitted_at,payment_status,near_ok,areas,dates,users(name,account_status,profiles(birth_year)),application_slots(slot_id)")
    .eq("round_id", tb.round_id)
    .eq("match_status", "ALTERNATIVE_OFFERED")
    .in("payment_status", ["REFUND_AVAILABLE", "PAID"])
    .order("submitted_at", { ascending: true });
  // 고른 일정이거나, '가까운 동네도 괜찮아요'를 켰고 같은 날 바로 옆 동네면 대기자로 본다
  const day = KST(new Date(tb.slots.starts_at));
  const fits = (a: { near_ok: boolean | null; areas: string[] | null; dates: string[] | null; application_slots: { slot_id: string }[] }) =>
    a.application_slots.some((x) => x.slot_id === tb.slot_id) ||
    (Boolean(a.near_ok) && (a.dates ?? []).includes(day) && neighborsOf(a.areas ?? []).includes(tb.slots.region));
  const rows = ((data ?? []) as unknown as { id: string; user_id: string; submitted_at: string; near_ok: boolean | null; areas: string[] | null; dates: string[] | null; users: { name: string; account_status: string; profiles: { birth_year: number } | { birth_year: number }[] | null }; application_slots: { slot_id: string }[] }[])
    .filter((a) => !skip.has(a.id) && ["active", "warned"].includes(a.users.account_status) && fits(a));
  const waiters = rows.map((a) => {
    const p = Array.isArray(a.users.profiles) ? a.users.profiles[0] : a.users.profiles;
    return { id: a.id, user_id: a.user_id, birth_year: p?.birth_year ?? 0, slotIds: a.application_slots.map((x) => x.slot_id), name: a.users.name, submitted_at: a.submitted_at };
  });
  if (!waiters.length) return [];
  const rel = await loadRelations([...group.map((m) => m.user_id), ...waiters.map((w) => w.user_id)]);
  return waiters.filter((w) => canJoin(group.map(toCand), toCand(w), rel, settings));
}

/** 빈자리를 다음 대기자에게 제안한다. 제안했으면 true */
export async function offerSeat(tableId: string, actor: string): Promise<boolean> {
  const tb = await tableInfo(tableId);
  if (!tb || !ACTIVE_TABLE.includes(tb.status)) return false;
  const { data: open } = await db().from("seat_offers").select("id").eq("table_id", tableId).eq("status", "pending");
  if (open?.length) return true;
  const settings = await loadSettings();
  const group = await tableMembers(tableId);
  if (group.length >= settings.maxSize) return false;
  const t = await now();
  const start = new Date(tb.slots.starts_at).getTime();
  const expires = Math.min(t.getTime() + OFFER_WINDOW, start - OFFER_CUTOFF);
  if (expires - t.getTime() < 30 * 60_000) return false; // 답할 시간이 30분도 안 남으면 묻지 않는다

  for (const w of await seatCandidates(tableId)) {
    const { data: offer, error } = await db()
      .from("seat_offers")
      .insert({ table_id: tableId, application_id: w.id, user_id: w.user_id, expires_at: new Date(expires).toISOString() })
      .select("id")
      .single();
    if (error || !offer) continue; // 동시에 다른 제안이 들어갔으면 건너뛴다
    await logStatus({ entityType: "application", entityId: w.id, field: "seat_offer", from: "ALTERNATIVE_OFFERED", to: "OFFERED", actor, reason: `빈자리 제안 (테이블 ${tableId.slice(0, 8)}, ${fmtSlot(tb.slots.starts_at)} ${tb.slots.region})` });
    await logStatus({ entityType: "dining_table", entityId: tableId, field: "seat_offer", to: "OFFERED", actor, reason: `대기자 ${w.name}님에게 빈자리 제안, 기한 ${fmtSlot(new Date(expires).toISOString())}` });
    await notify({
      userId: w.user_id,
      template: "seat_offer",
      title: "기다리던 자리가 났어요",
      body: `${fmtSlot(tb.slots.starts_at)} · ${sameDay(new Date(expires).toISOString(), t) ? `오늘 ${fmtClock(new Date(expires).toISOString())}` : fmtSlot(new Date(expires).toISOString())}까지 답해 주세요`,
      link: `/offers/${offer.id}`,
      dedupeKey: `seat_offer:${offer.id}`,
    });
    return true;
  }
  return false;
}

/** 빈자리를 대기자로 채우고, 채울 사람이 없을 때만 인원 부족 정리를 한다 */
export async function fillOrReflow(tableId: string, actor: string) {
  const offered = await offerSeat(tableId, actor);
  if (!offered) {
    await reflowTable(tableId, actor);
    return;
  }
  // 대기자 답을 기다리는 동안 인원이 모자라면 남은 분들께 '다른 자리를 찾는 중'이라고 알린다 (14장 자동 재배치 중)
  const [settings, group, tb] = await Promise.all([loadSettings(), tableMembers(tableId), tableInfo(tableId)]);
  if (!tb || group.length >= settings.minSize) return;
  const msg = render("reallocating", { ...slotVars(tb.slots.starts_at), region: tb.slots.region }, await loadTemplates());
  for (const m of group) {
    await notify({ userId: m.user_id, template: "reallocating", title: msg.title, body: msg.body, link: `/applications/${m.id}`, dedupeKey: `reallocating:${tableId}:${m.id}` });
  }
}

type OfferRow = { id: string; table_id: string; application_id: string; user_id: string; status: string; expires_at: string };

/** 대기자가 제안에 답한다 */
export async function respondOffer(offerId: string, userId: string, accept: boolean): Promise<{ ok: boolean; message: string; tableId?: string }> {
  const { data } = await db().from("seat_offers").select("id,table_id,application_id,user_id,status,expires_at").eq("id", offerId).maybeSingle();
  const o = data as OfferRow | null;
  if (!o || o.user_id !== userId) return { ok: false, message: "찾을 수 없는 제안이에요" };
  if (o.status !== "pending") return { ok: false, message: "이미 답한 제안이에요" };
  const t = await now();
  const actor = `user:${userId}`;
  if (new Date(o.expires_at) <= t) {
    await closeOffer(o, "expired", "system");
    return { ok: false, message: "응답 기한이 지나 다음 분께 자리가 넘어갔어요" };
  }
  if (!accept) {
    await closeOffer(o, "declined", actor);
    return { ok: true, message: "다음 기회에 함께해요. 지금 신청은 그대로 남아 있어요" };
  }

  // 받기 전에 조건을 다시 본다: 아직 대기 중인지, 테이블이 살아 있는지, 자리가 있는지, 조건이 맞는지
  const [{ data: app }, tb, settings] = await Promise.all([
    db().from("applications").select("id,match_status,payment_status").eq("id", o.application_id).single(),
    tableInfo(o.table_id),
    loadSettings(),
  ]);
  const group = await tableMembers(o.table_id);
  const rel = await loadRelations([...group.map((m) => m.user_id), userId]);
  const me = await tableMembersOf(o.application_id);
  const ok =
    app?.match_status === "ALTERNATIVE_OFFERED" &&
    tb && ACTIVE_TABLE.includes(tb.status) &&
    group.length < settings.maxSize &&
    me && canJoin(group.map(toCand), toCand(me), rel, settings);
  if (!ok) {
    await closeOffer(o, "void", "system");
    return { ok: false, message: "그사이 자리 사정이 바뀌어 합류할 수 없게 됐어요. 지금 신청은 그대로 남아 있어요" };
  }

  const { data: took } = await db().from("seat_offers").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", o.id).eq("status", "pending").select("id");
  if (!took?.length) return { ok: false, message: "이미 답한 제안이에요" };
  await db()
    .from("applications")
    .update({
      table_id: o.table_id,
      match_status: "CONFIRMED",
      attendance_status: "SCHEDULED",
      payment_status: app!.payment_status === "REFUND_AVAILABLE" ? "PAID" : app!.payment_status,
      resolution: null,
      match_reason: `취소석에 합류했어요. ${fmtSlot(tb!.slots.starts_at)} ${tb!.slots.region} 테이블이에요.`,
    })
    .eq("id", o.application_id)
    .eq("match_status", "ALTERNATIVE_OFFERED");
  // 옆 동네 자리였으면 그 일정도 고른 것으로 남긴다 (이후 재배치 검사가 같은 기준을 보도록)
  await db().from("application_slots").upsert({ application_id: o.application_id, slot_id: tb!.slot_id }, { onConflict: "application_id,slot_id", ignoreDuplicates: true });
  await logStatus({ entityType: "application", entityId: o.application_id, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "CONFIRMED", actor, reason: `빈자리 제안 수락 (테이블 ${o.table_id.slice(0, 8)})` });
  await logStatus({ entityType: "dining_table", entityId: o.table_id, field: "seat_offer", to: "ACCEPTED", actor, reason: `대기자 ${me!.name}님 합류` });
  // 같은 사람에게 동시에 나간 다른 테이블 제안은 무효로 하고 그 테이블은 다음 사람에게 넘긴다
  const { data: others } = await db().from("seat_offers").select("id,table_id,application_id,user_id,status,expires_at").eq("application_id", o.application_id).eq("status", "pending");
  for (const x of (others ?? []) as OfferRow[]) await closeOffer(x, "void", "system");
  // 결제 독촉·대안 안내처럼 이제 필요 없는 예약 알림 정리
  await db().from("notifications").delete().eq("user_id", userId).eq("status", "pending").eq("link", `/applications/${o.application_id}/resolve`);
  const room = await ensureRoom(o.table_id);
  await postSystem(room, `빈자리에 새로운 분이 합류했어요. ${me!.name}님 반가워요!`);
  await notify({
    userId,
    template: "joined",
    ...render("joined", { ...slotVars(tb!.slots.starts_at), region: tb!.slots.region, venue: tb!.venues?.name ?? "" }, await loadTemplates()),
    link: `/tables/${o.table_id}`,
    dedupeKey: `seat_accept:${o.id}`,
  });
  // 아직 자리가 남으면 다음 대기자에게도 묻는다
  await offerSeat(o.table_id, "system");
  return { ok: true, message: "테이블에 합류했어요", tableId: o.table_id };
}

export async function tableMembersOf(appId: string): Promise<Member | null> {
  const { data } = await db().from("applications").select("id,user_id,users(name,profiles(birth_year)),application_slots(slot_id)").eq("id", appId).maybeSingle();
  if (!data) return null;
  const a = data as unknown as { id: string; user_id: string; users: { name: string; profiles: { birth_year: number } | { birth_year: number }[] | null }; application_slots: { slot_id: string }[] };
  const p = Array.isArray(a.users.profiles) ? a.users.profiles[0] : a.users.profiles;
  return { id: a.id, user_id: a.user_id, birth_year: p?.birth_year ?? 0, slotIds: a.application_slots.map((x) => x.slot_id), name: a.users.name };
}

/** 제안을 닫고 (거절·만료·무효) 다음 대기자에게 넘긴다 */
async function closeOffer(o: OfferRow, status: "declined" | "expired" | "void", actor: string) {
  const { data: up } = await db().from("seat_offers").update({ status, responded_at: new Date().toISOString() }).eq("id", o.id).eq("status", "pending").select("id");
  if (!up?.length) return;
  const word = { declined: "거절", expired: "응답 기한 지남", void: "조건이 바뀌어 무효" }[status];
  await logStatus({ entityType: "application", entityId: o.application_id, field: "seat_offer", from: "OFFERED", to: status.toUpperCase(), actor, reason: `빈자리 제안 ${word}` });
  await logStatus({ entityType: "dining_table", entityId: o.table_id, field: "seat_offer", to: status.toUpperCase(), actor, reason: `빈자리 제안 ${word}, 다음 대기자 확인` });
  if (status === "expired") {
    await notify({ userId: o.user_id, template: "seat_offer_expired", title: "빈자리 제안 기한이 지났어요", body: "다음 분께 넘겼어요. 신청은 그대로예요", link: `/applications/${o.application_id}`, dedupeKey: `seat_offer_expired:${o.id}` });
  }
  await fillOrReflow(o.table_id, "system");
}

/** 기한이 지난 제안을 정리한다 (tick에서 부른다) */
export async function expireOffers(): Promise<number> {
  const t = await now();
  const { data } = await db().from("seat_offers").select("id,table_id,application_id,user_id,status,expires_at").eq("status", "pending").lte("expires_at", t.toISOString());
  for (const o of (data ?? []) as OfferRow[]) await closeOffer(o, "expired", "system");
  return data?.length ?? 0;
}
