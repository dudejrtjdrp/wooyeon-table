// 매칭 실패 뒤 다음 방법 (PRD 7.3 재배치 순서의 마지막 단계와 STA-05~07)
// 1) 빈자리가 있는 테이블에 바로 합류  2) 다른 일정으로 옮기기(고른 동네 → 옆 동네 → 조금 먼 동네)
// 3) 자리 나면 알려 주기(마감 있음)  4) 이용권 보관  5) 환불
// 아무것도 고르지 않으면 3일 뒤 이용권으로 보관하고, 하루 전에 한 번 더 알린다. 기다리기는 모임 2일 전에 끝난다.
import { ACTIVE_TABLE, offerSeat, tableInfo, tableMembers, tableMembersOf, toCand } from "./attendance";
import { now } from "./clock";
import { logStatus } from "./events";
import { fmtDate, fmtTime } from "./format";
import { canJoin } from "./matching/constraints";
import { scoreGroup } from "./matching/score";
import { loadRelations, loadSettings } from "./matching/runner";
import { notify } from "./notify";
import { ensureRoom } from "./pipeline";
import { kstDay, neighborsOf } from "./regions";
import { isMembership } from "./constants";
import { db } from "./supabase";
import { loadTemplates, render } from "./templates";

import { AUTO_KEEP_AFTER, TAG_RANK, WAIT_CUTOFF, countFrom, moveTag, noAnswerStep, waitDeadline as deadlineOf, type MoveTag } from "./resolve-rules";

type AppRow = {
  id: string; user_id: string; round_id: string; match_status: string; payment_status: string; payment_id: string | null;
  near_ok: boolean | null; areas: string[] | null; dates: string[] | null; resolution: string | null; wait_until: string | null; match_reason: string | null; payments?: { pass_type: string | null } | null;
  application_slots: { slot_id: string; slots: { region: string; starts_at: string } | null }[];
};
const APP_COLS = "id,user_id,round_id,match_status,payment_status,payment_id,near_ok,areas,dates,resolution,wait_until,match_reason,payments(pass_type),application_slots(slot_id,slots(region,starts_at))";

export async function loadApp(appId: string): Promise<AppRow | null> {
  const { data } = await db().from("applications").select(APP_COLS).eq("id", appId).maybeSingle();
  return data as unknown as AppRow | null;
}

/** 이 사람이 고른 동네(신청 때 고른 묶음 + 고른 일정의 동네) */
export function likedAreas(app: Pick<AppRow, "areas" | "application_slots">): string[] {
  return [...new Set([...(app.areas ?? []), ...app.application_slots.map((s) => s.slots?.region).filter((x): x is string => Boolean(x))])];
}

/** 매칭 실패로 바뀐 시각 (가장 최근) */
export async function failedAt(appId: string): Promise<Date | null> {
  const { data } = await db()
    .from("status_events")
    .select("created_at")
    .eq("entity_type", "application")
    .eq("entity_id", appId)
    .eq("field", "match_status")
    .eq("to_value", "ALTERNATIVE_OFFERED")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ? new Date(data[0].created_at) : null;
}

/** 자리 나면 알려 주기를 어디까지 받을 수 있는지: 고른 일정 중 가장 늦은 모임의 2일 전 */
export function waitDeadline(app: Pick<AppRow, "application_slots">, at: Date): Date | null {
  return deadlineOf(app.application_slots.map((s) => s.slots?.starts_at).filter((x): x is string => Boolean(x)), at);
}

export type JoinOption = { tableId: string; roundId: string; slotId: string; startsAt: string; region: string; venue: string | null; members: number; tag: string };

/**
 * 빈자리가 있어서 바로 앉을 수 있는 테이블. 고른 동네나 바로 옆 동네, 모임 2일 이상 남은 것만.
 * 나이·차단·비선호 조건은 지금 테이블 사람들과 다시 맞춰 본다.
 */
export async function joinOptions(app: AppRow): Promise<JoinOption[]> {
  const t = await now();
  const liked = likedAreas(app);
  const near = neighborsOf(liked);
  const regions = [...liked, ...near];
  if (!regions.length) return [];
  const { data } = await db()
    .from("dining_tables")
    .select("id,round_id,slot_id,status,slots!inner(region,starts_at),venues(name)")
    .in("status", ACTIVE_TABLE)
    .in("slots.region", regions)
    .gt("slots.starts_at", new Date(t.getTime() + WAIT_CUTOFF).toISOString());
  const tables = (data ?? []) as unknown as { id: string; round_id: string; slot_id: string; slots: { region: string; starts_at: string }; venues: { name: string } | null }[];
  if (!tables.length) return [];
  const settings = await loadSettings();
  const me = await tableMembersOf(app.id);
  if (!me) return [];
  // 이용이 제한된 계정은 바로 앉을 수 없다 (운영자 조치가 매칭을 막아야 함)
  const { data: acct } = await db().from("users").select("account_status").eq("id", app.user_id).maybeSingle();
  if (!["active", "warned"].includes(acct?.account_status ?? "")) return [];
  const out: JoinOption[] = [];
  for (const tb of tables) {
    const group = await tableMembers(tb.id);
    if (!group.length || group.length >= settings.maxSize) continue;
    const rel = await loadRelations([...group.map((m) => m.user_id), app.user_id]);
    if (!canJoin(group.map(toCand), toCand(me), rel, settings)) continue;
    // 합류 뒤에도 자동 확정 최소 점수를 넘어야 한다 (엔진과 같은 기준)
    const full = await scoreWith(tb.id, [...group.map((m) => m.user_id), app.user_id], rel, settings);
    if (full !== null && full < settings.minScore) continue;
    // 다른 차수 테이블이면 그 차수에 이미 신청이 있는지 본다
    if (tb.round_id !== app.round_id) {
      const { data: dup } = await db().from("applications").select("id").eq("user_id", app.user_id).eq("round_id", tb.round_id).neq("application_status", "CANCELED").maybeSingle();
      if (dup) continue;
    }
    out.push({
      tableId: tb.id, roundId: tb.round_id, slotId: tb.slot_id, startsAt: tb.slots.starts_at, region: tb.slots.region,
      venue: tb.venues?.name ?? null, members: group.length, tag: liked.includes(tb.slots.region) ? "고른 동네" : "옆 동네",
    });
  }
  return out.sort((a, b) => Number(b.tag === "고른 동네") - Number(a.tag === "고른 동네") || a.startsAt.localeCompare(b.startsAt)).slice(0, 3);
}

export type MoveOption = { id: string; roundId: string; label: string; note: string; tag: MoveTag; hot: boolean };

/** 옮길 수 있는 모집 중 일정: 고른 동네 → 옆 동네 → 같은 시·도의 조금 먼 동네. 다른 시·도는 추천하지 않는다 */
export async function moveOptions(app: AppRow): Promise<MoveOption[]> {
  const t = await now();
  const liked = likedAreas(app);
  const { data: mine } = await db().from("applications").select("round_id").eq("user_id", app.user_id).neq("application_status", "CANCELED");
  const taken = new Set((mine ?? []).map((a) => a.round_id));
  const { data: rounds } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(id,region,sido,starts_at,application_slots(count))")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline")
    .limit(4);
  type S = { id: string; region: string; sido: string | null; starts_at: string; application_slots: { count: number }[] };
  return ((rounds ?? []) as unknown as { id: string; apply_deadline: string; slots: S[] }[])
    .filter((r) => !taken.has(r.id))
    .flatMap((r) => r.slots.map((s) => ({ s, r })))
    .map(({ s, r }) => {
      const tag = moveTag(s.region, s.sido, liked);
      const demand = s.application_slots?.[0]?.count ?? 0;
      return {
        id: s.id, roundId: r.id, tag, starts: s.starts_at, demand,
        label: `${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)} · ${s.region}`,
        note: demand >= 4 ? `신청 ${demand}명` : `${fmtDate(r.apply_deadline)} 마감`,
        hot: demand >= 4,
      };
    })
    .filter((o): o is typeof o & { tag: MoveTag } => o.tag !== null)
    .sort((a, b) => TAG_RANK[a.tag] - TAG_RANK[b.tag] || b.demand - a.demand || a.starts.localeCompare(b.starts))
    .slice(0, 5)
    .map(({ id, roundId, label, note, tag, hot }) => ({ id, roundId, label, note, tag, hot }));
}

/** 빈자리에 바로 합류. 같은 차수면 신청을 그대로 확정하고, 다른 차수면 결제를 유지한 채 그 차수 신청으로 옮겨 확정한다 */
export async function joinTable(appId: string, tableId: string, actor: string): Promise<{ ok: boolean; message: string }> {
  const app = await loadApp(appId);
  if (!app || app.match_status !== "ALTERNATIVE_OFFERED") return { ok: false, message: "이미 처리된 신청이에요" };
  const option = (await joinOptions(app)).find((o) => o.tableId === tableId);
  if (!option) return { ok: false, message: "그사이 자리가 차서 합류할 수 없게 됐어요. 다른 방법을 골라 주세요" };
  const tb = (await tableInfo(tableId))!;
  const reason = `빈자리에 바로 합류했어요. ${fmtDate(tb.slots.starts_at)} ${tb.slots.region} 테이블이에요.`;
  let targetApp = appId;

  if (option.roundId === app.round_id) {
    const { data: up } = await db()
      .from("applications")
      .update({ table_id: tableId, match_status: "CONFIRMED", attendance_status: "SCHEDULED", payment_status: "PAID", resolution: null, wait_until: null, match_reason: reason })
      .eq("id", appId)
      .eq("match_status", "ALTERNATIVE_OFFERED")
      .select("id");
    if (!up?.length) return { ok: false, message: "이미 처리된 신청이에요" };
    await db().from("application_slots").upsert({ application_id: appId, slot_id: option.slotId }, { onConflict: "application_id,slot_id", ignoreDuplicates: true });
    await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "CONFIRMED", actor, reason: `빈자리 합류 (테이블 ${tableId.slice(0, 8)})` });
  } else {
    const { data: closed } = await db()
      .from("applications")
      .update({ match_status: "TRANSFERRED", payment_status: "PAID", resolution: "transfer", wait_until: null })
      .eq("id", appId)
      .eq("match_status", "ALTERNATIVE_OFFERED")
      .select("id");
    if (!closed?.length) return { ok: false, message: "이미 처리된 신청이에요" };
    const { data: next, error } = await db()
      .from("applications")
      .insert({
        user_id: app.user_id, round_id: option.roundId, payment_id: app.payment_id, application_status: "SUBMITTED", payment_status: "PAID",
        match_status: "CONFIRMED", attendance_status: "SCHEDULED", table_id: tableId, transferred_from: appId, submitted_at: new Date().toISOString(),
        areas: [option.region], dates: [kstDay(option.startsAt)], near_ok: app.near_ok ?? false, match_reason: reason,
      })
      .select("id")
      .single();
    if (error || !next) {
      // 새 신청을 못 만들었으면 원래대로 돌린다
      await db().from("applications").update({ match_status: "ALTERNATIVE_OFFERED", payment_status: app.payment_status, resolution: app.resolution, wait_until: app.wait_until }).eq("id", appId);
      return { ok: false, message: "합류하지 못했어요. 잠시 뒤 다시 시도해 주세요" };
    }
    targetApp = next.id;
    await db().from("application_slots").insert({ application_id: next.id, slot_id: option.slotId });
    await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "TRANSFERRED", actor, reason: `다른 차수 빈자리로 이동 (테이블 ${tableId.slice(0, 8)})` });
    await logStatus({ entityType: "application", entityId: next.id, field: "match_status", to: "CONFIRMED", actor, reason: "빈자리 합류, 결제 유지" });
  }

  // 동시에 두 사람이 앉거나 빈자리 제안 수락과 겹쳐 정원을 넘었으면 이번 합류를 되돌린다
  const settings = await loadSettings();
  if ((await tableMembers(tableId)).length > settings.maxSize) {
    if (targetApp === appId) {
      await db().from("applications").update({ table_id: null, match_status: "ALTERNATIVE_OFFERED", attendance_status: null, payment_status: app.payment_status, resolution: app.resolution, wait_until: app.wait_until, match_reason: app.match_reason }).eq("id", appId);
    } else {
      await db().from("applications").delete().eq("id", targetApp);
      await db().from("applications").update({ match_status: "ALTERNATIVE_OFFERED", payment_status: app.payment_status, resolution: app.resolution, wait_until: app.wait_until }).eq("id", appId);
    }
    await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor: "system", reason: "같은 순간 자리가 먼저 차서 합류 취소" });
    return { ok: false, message: "같은 순간 다른 분이 먼저 앉아 자리가 찼어요. 다른 방법을 골라 주세요" };
  }

  const me = await tableMembersOf(targetApp);
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "member", to: "JOINED", actor, reason: `매칭 실패자 ${me?.name ?? ""}님이 빈자리에 합류` });
  // 같은 사람에게 나가 있던 빈자리 제안·실패 안내 예약 알림은 정리한다
  const { data: offers } = await db().from("seat_offers").select("id,table_id").eq("application_id", appId).eq("status", "pending");
  for (const o of offers ?? []) {
    await db().from("seat_offers").update({ status: "void", responded_at: new Date().toISOString() }).eq("id", o.id).eq("status", "pending");
    await offerSeat(o.table_id, "system");
  }
  await db().from("notifications").delete().eq("user_id", app.user_id).eq("status", "pending").eq("link", `/applications/${appId}/resolve`);
  const room = await ensureRoom(tableId);
  await db().from("chat_messages").insert({ room_id: room, kind: "system", body: `빈자리에 새로운 분이 합류했어요. ${me?.name ?? ""}님 반가워요!` });
  await notify({
    userId: app.user_id,
    template: "confirmed",
    title: "테이블에 합류했어요",
    body: `${fmtDate(tb.slots.starts_at)} ${fmtTime(tb.slots.starts_at)} ${tb.slots.region}${tb.venues ? ` ${tb.venues.name}` : ""}에서 만나요. 단체방에서 인사를 나눠 보세요.`,
    link: `/tables/${tableId}`,
    dedupeKey: `join:${appId}:${tableId}`,
  });
  return { ok: true, message: "테이블에 합류했어요" };
}

/** 이용권 보관: 이번 신청에 쓴 1회를 돌려준다. 참가자가 고르거나, 기한이 지나 자동으로 */
export async function keepPassFor(appId: string, actor: string, why: "choice" | "no_answer" | "wait_over"): Promise<boolean> {
  const { data } = await db().from("applications").select("id,user_id,payments(pass_id,pass_type)").eq("id", appId).maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payments: { pass_id: string | null; pass_type: string | null } | null } | null;
  const membership = isMembership(app?.payments?.pass_type);
  if (!app) return false;
  const { data: up } = await db()
    .from("applications")
    .update({ match_status: "NO_MATCH", payment_status: "PAID", resolution: "keep_pass", wait_until: null })
    .eq("id", appId)
    .eq("match_status", "ALTERNATIVE_OFFERED")
    .select("id");
  if (!up?.length) return false;
  // 멤버십은 횟수가 없어 돌려줄 것이 없다(실패 때 기간을 이미 늘려 줌)
  if (app.payments?.pass_id && !membership) {
    const { data: pass } = await db().from("passes").select("remaining").eq("id", app.payments.pass_id).single();
    await db().from("passes").update({ remaining: (pass?.remaining ?? 0) + 1 }).eq("id", app.payments.pass_id);
  }
  const reason = { choice: "이용권 보관", no_answer: "3일 동안 고르지 않아 이용권으로 자동 보관", wait_over: "기다리던 자리가 나지 않아 이용권으로 자동 보관" }[why];
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "NO_MATCH", actor, reason });
  await db().from("seat_offers").update({ status: "void", responded_at: new Date().toISOString() }).eq("application_id", appId).eq("status", "pending");
  const body = {
    choice: "다음 일정을 신청할 때 그대로 쓸 수 있어요.",
    no_answer: "3일 동안 고르지 않으셔서 이용권으로 보관했어요. 결제한 금액은 그대로 남아 있고, 다음 일정에 바로 쓸 수 있어요.",
    wait_over: "기다리던 동네에 자리가 나지 않아 이용권으로 보관했어요. 다음 일정에 바로 쓸 수 있어요.",
  }[why];
  await notify({
    userId: app.user_id,
    template: "kept",
    title: membership ? "이번 일정은 넘겼어요" : "이용권을 보관했어요",
    body: membership ? "멤버십 기간은 이미 늘려 드렸어요. 기간 안에 다른 일정을 바로 신청할 수 있어요." : body,
    link: "/rounds",
    dedupeKey: `kept:${appId}`,
  });
  return true;
}

/** 자리 나면 알려 주기: 마감까지 빈자리 제안을 받고, 3일 자동 보관은 멈춘다 */
export async function startWaiting(appId: string, actor: string): Promise<{ ok: boolean; message: string }> {
  const app = await loadApp(appId);
  if (!app || app.match_status !== "ALTERNATIVE_OFFERED") return { ok: false, message: "이미 처리된 신청이에요" };
  const until = waitDeadline(app, await now());
  if (!until) return { ok: false, message: "모임이 2일 안으로 다가와 더 기다릴 수 없어요. 다른 방법을 골라 주세요" };
  await db().from("applications").update({ resolution: "wait", wait_until: until.toISOString() }).eq("id", appId).eq("match_status", "ALTERNATIVE_OFFERED");
  await logStatus({ entityType: "application", entityId: appId, field: "resolution", from: app.resolution ?? undefined, to: "wait", actor, reason: `자리 나면 알려 주기 (${fmtDate(until.toISOString())} ${fmtTime(until.toISOString())}까지)` });
  // 이미 비어 있는 자리가 있으면 바로 묻는다
  const { data: tables } = await db().from("dining_tables").select("id").eq("round_id", app.round_id).in("status", ACTIVE_TABLE);
  for (const tb of tables ?? []) await offerSeat(tb.id, "system");
  await db().from("notifications").delete().eq("user_id", app.user_id).eq("status", "pending").like("dedupe_key", `alt_remind:${appId}%`);
  await notify({
    userId: app.user_id,
    template: "waiting",
    title: "자리가 나면 바로 알려 드릴게요",
    body: `${fmtDate(until.toISOString())} ${fmtTime(until.toISOString())}까지 ${app.near_ok ? "고른 동네나 같은 날 바로 옆 동네" : "고른 동네·날짜"}에 자리가 나면 먼저 여쭤볼게요. 그때까지 자리가 없으면 이용권으로 보관해 드려요.`,
    link: `/applications/${appId}`,
    dedupeKey: `waiting:${appId}`,
  });
  return { ok: true, message: "자리가 나면 바로 알려 드릴게요" };
}

/**
 * tick에서 부른다.
 * - 실패 안내 뒤 2일: 하루 남았다고 한 번 더 알림
 * - 실패 안내 뒤 3일: 고르지 않았으면 이용권 보관
 * - 기다리기 마감이 지나면 이용권 보관
 * 빈자리 제안이 나가 있는 사람은 그 제안이 끝날 때까지 건드리지 않는다.
 */
export async function autoResolve(): Promise<{ reminded: number; kept: number; waitOver: number }> {
  const t = await now();
  const res = { reminded: 0, kept: 0, waitOver: 0 };
  const { data } = await db().from("applications").select("id,user_id,resolution,wait_until").eq("match_status", "ALTERNATIVE_OFFERED").limit(200);
  const apps = (data ?? []) as { id: string; user_id: string; resolution: string | null; wait_until: string | null }[];
  if (!apps.length) return res;
  const { data: offers } = await db().from("seat_offers").select("application_id").eq("status", "pending").in("application_id", apps.map((a) => a.id));
  const offered = new Set((offers ?? []).map((o) => o.application_id));
  for (const a of apps) {
    if (offered.has(a.id)) continue;
    if (a.resolution === "wait") {
      if (a.wait_until && new Date(a.wait_until) <= t && (await keepPassFor(a.id, "system", "wait_over"))) res.waitOver++;
      continue;
    }
    const at = await failedAt(a.id);
    if (!at) continue;
    const step = noAnswerStep(at, t);
    if (step === "keep") {
      if (await keepPassFor(a.id, "system", "no_answer")) res.kept++;
    } else if (step === "remind") {
      const { data: sent } = await db().from("notifications").select("id").eq("dedupe_key", `alt_remind:${a.id}`).maybeSingle();
      if (!sent) {
        const m = render("alternative_remind", {}, await loadTemplates());
        await notify({
          userId: a.user_id,
          template: "alternative_remind",
          title: m.title,
          body: m.body,
          link: `/applications/${a.id}/resolve`,
          dedupeKey: `alt_remind:${a.id}`,
        });
        res.reminded++;
      }
    }
  }
  return res;
}

/** 자동 보관 예정 시각 (화면 안내용) */
export async function autoKeepAt(appId: string): Promise<Date | null> {
  const at = await failedAt(appId);
  return at ? new Date(countFrom(at).getTime() + AUTO_KEEP_AFTER) : null;
}


/** 이 사람들이 한 테이블에 앉았을 때 점수 (엔진의 scoreGroup과 같은 계산). 프로필을 못 읽으면 null */
async function scoreWith(_tableId: string, userIds: string[], rel: Awaited<ReturnType<typeof loadRelations>>, settings: Awaited<ReturnType<typeof loadSettings>>): Promise<number | null> {
  const { data } = await db().from("profiles").select("user_id,gender,birth_year,mbti,interests,my_traits,wanted_traits").in("user_id", userIds);
  if (!data || data.length !== userIds.length) return null;
  const cands = (data as { user_id: string; gender: string; birth_year: number; mbti: string | null; interests: string[] | null; my_traits: string[] | null; wanted_traits: string[] | null }[]).map((p) => ({
    applicationId: p.user_id, userId: p.user_id, birthYear: p.birth_year, gender: p.gender as "M" | "F", mbti: p.mbti, interests: p.interests ?? [], myTraits: p.my_traits ?? [], wantedTraits: p.wanted_traits ?? [], slotIds: [],
  }));
  return scoreGroup(cands, rel, settings).gate;
}
