// 확정 뒤 참가 취소와, 인원이 모자란 테이블의 자동 재배치 (PRD 15장 "확정 후 1명 취소")
import { releaseUse } from "./billing";
import { now } from "./clock";
import { logStatus } from "./events";
import { fmtDate, fmtTime } from "./format";
import { canJoin } from "./matching/constraints";
import { loadRelations, loadSettings } from "./matching/runner";
import type { Candidate } from "./matching/types";
import { notify } from "./notify";
import { ensureRoom } from "./pipeline";
import { db } from "./supabase";

const KST = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export type CancelRule = { kind: "early" | "late" | "blocked"; message: string };

/** 지금 취소하면 어떻게 되는지. 2일 전까지는 전액 환불, 그 뒤는 환불 없이 취소, 당일은 취소 불가 */
export function cancelRule(startsAt: string, at: Date): CancelRule {
  const start = new Date(startsAt);
  if (at >= start) return { kind: "blocked", message: "모임이 이미 시작됐어요" };
  if (KST(at) === KST(start)) return { kind: "blocked", message: "당일 취소는 할 수 없어요. 늦을 것 같으면 단체방에 알려 주세요" };
  if (start.getTime() - at.getTime() >= 48 * 3600_000) return { kind: "early", message: "지금 취소하면 전액 돌려드려요" };
  return { kind: "late", message: "모임 2일 전이 지나 환불 없이 취소돼요" };
}

type Member = { id: string; user_id: string; birth_year: number; slotIds: string[]; name: string };

async function tableMembers(tableId: string): Promise<Member[]> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,users(name,profiles(birth_year)),application_slots(slot_id)")
    .eq("table_id", tableId)
    .eq("match_status", "CONFIRMED")
    .eq("attendance_status", "SCHEDULED");
  return ((data ?? []) as unknown as { id: string; user_id: string; users: { name: string; profiles: { birth_year: number } | { birth_year: number }[] | null }; application_slots: { slot_id: string }[] }[]).map((a) => {
    const p = Array.isArray(a.users.profiles) ? a.users.profiles[0] : a.users.profiles;
    return { id: a.id, user_id: a.user_id, birth_year: p?.birth_year ?? 0, slotIds: a.application_slots.map((s) => s.slot_id), name: a.users.name };
  });
}

const toCand = (m: Member): Candidate => ({
  applicationId: m.id, userId: m.user_id, birthYear: m.birth_year, gender: "M", mbti: null, interests: [], myTraits: [], wantedTraits: [], slotIds: m.slotIds,
});

/** 참가자가 확정된 모임을 취소한다 */
export async function cancelAttendance(appId: string, userId: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,table_id,match_status,attendance_status,dining_tables(id,status,slots(starts_at))")
    .eq("id", appId)
    .maybeSingle();
  const a = data as unknown as { id: string; user_id: string; table_id: string | null; match_status: string; attendance_status: string | null; dining_tables: { id: string; status: string; slots: { starts_at: string } } | null } | null;
  if (!a || a.user_id !== userId) return { ok: false, message: "취소할 수 없는 신청이에요" };
  if (a.match_status !== "CONFIRMED" || a.attendance_status !== "SCHEDULED" || !a.dining_tables) return { ok: false, message: "이미 처리된 신청이에요" };
  const t = await now();
  const rule = cancelRule(a.dining_tables.slots.starts_at, t);
  if (rule.kind === "blocked") return { ok: false, message: rule.message };

  const to = rule.kind === "early" ? "CANCELED_EARLY" : "CANCELED_LATE";
  const tableId = a.dining_tables.id;
  // 조건부: 두 번 눌러도 한 번만
  const { data: up } = await db().from("applications").update({ attendance_status: to, table_id: null }).eq("id", appId).eq("attendance_status", "SCHEDULED").select("id");
  if (!up?.length) return { ok: false, message: "이미 처리된 신청이에요" };
  await logStatus({ entityType: "application", entityId: appId, field: "attendance_status", from: "SCHEDULED", to, actor: `user:${userId}`, reason: `참가자 취소 (테이블 ${tableId.slice(0, 8)})` });
  // 이 사람에게 예약해 둔 이 테이블 안내는 보내지 않는다
  await db().from("notifications").delete().eq("user_id", userId).eq("status", "pending").eq("link", `/tables/${tableId}`);

  let body: string;
  if (rule.kind === "early") body = await releaseUse(appId, `user:${userId}`, "모임 2일 전까지 취소");
  else body = "모임 2일 전이 지나 환불 없이 취소됐어요.";
  await notify({ userId, template: "attendance_canceled", title: "참석을 취소했어요", body, link: `/applications/${appId}`, dedupeKey: `attendance_canceled:${appId}` });

  const roomId = await ensureRoom(tableId);
  await db().from("chat_messages").insert({ room_id: roomId, kind: "system", body: "한 분이 사정이 생겨 함께하지 못하게 됐어요." });
  await reflowTable(tableId, `user:${userId}`);
  return { ok: true, message: body };
}

/**
 * 인원이 4명 아래로 줄어든 테이블을 정리한다.
 * 남은 사람을 같은 회차에서 본인이 고른 일정의 다른 확정 테이블로 옮기고(나이·제외 조건은 그대로 지킴),
 * 옮길 곳이 없는 사람에게는 매칭 실패와 같은 선택지(다른 일정·보관·환불)를 준다.
 */
export async function reflowTable(tableId: string, actor: string) {
  const settings = await loadSettings();
  const members = await tableMembers(tableId);
  if (members.length >= settings.minSize) return { moved: 0, offered: 0 };

  const { data: tb } = await db().from("dining_tables").select("id,round_id,slot_id").eq("id", tableId).single();
  const t = await now();
  const { data: others } = await db()
    .from("dining_tables")
    .select("id,slot_id,slots(starts_at,region)")
    .eq("round_id", tb!.round_id)
    .neq("id", tableId)
    .in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY"]);
  const targets = ((others ?? []) as unknown as { id: string; slot_id: string; slots: { starts_at: string; region: string } }[]).filter(
    (o) => new Date(o.slots.starts_at).getTime() - t.getTime() > 24 * 3600_000,
  );
  const rel = await loadRelations(members.map((m) => m.user_id));
  const groups = new Map<string, Member[]>();
  for (const o of targets) groups.set(o.id, await tableMembers(o.id));

  let moved = 0;
  let offered = 0;
  // 같은 일정 테이블을 먼저 본다 (7.4 재배치 순서)
  targets.sort((x, y) => Number(y.slot_id === tb!.slot_id) - Number(x.slot_id === tb!.slot_id));
  for (const m of members) {
    const target = targets.find((o) => {
      const g = groups.get(o.id)!;
      return m.slotIds.includes(o.slot_id) && g.length < settings.maxSize && canJoin(g.map(toCand), toCand(m), rel, settings);
    });
    if (target) {
      await db().from("applications").update({ table_id: target.id, match_reason: `함께하기로 한 분이 취소해 ${fmtDate(target.slots.starts_at)} ${target.slots.region} 테이블로 옮겼어요.` }).eq("id", m.id);
      const { data: cur } = await db().from("applications").select("realloc_count").eq("id", m.id).single();
      await db().from("applications").update({ realloc_count: (cur?.realloc_count ?? 0) + 1 }).eq("id", m.id);
      await logStatus({ entityType: "application", entityId: m.id, field: "match_status", from: "CONFIRMED", to: "CONFIRMED", actor, reason: `인원 부족으로 다른 테이블 재배치 (${tableId.slice(0, 8)} → ${target.id.slice(0, 8)})` });
      groups.get(target.id)!.push(m);
      const room = await ensureRoom(target.id);
      await db().from("chat_messages").insert({ room_id: room, kind: "system", body: `새로운 분이 합류했어요. ${m.name}님 반가워요!` });
      await notify({ userId: m.user_id, template: "reallocated", title: "테이블이 바뀌었어요", body: `함께하기로 한 분이 취소해 ${fmtDate(target.slots.starts_at)} ${fmtTime(target.slots.starts_at)} ${target.slots.region} 테이블로 옮겼어요. 새 단체방을 확인해 주세요.`, link: `/tables/${target.id}`, dedupeKey: `reflow:${m.id}:${target.id}` });
      moved++;
    } else {
      await db().from("applications").update({ table_id: null, match_status: "ALTERNATIVE_OFFERED", payment_status: "REFUND_AVAILABLE", match_reason: "함께하기로 한 분이 취소해 테이블 인원이 모자라요. 조건에 맞는 다른 테이블도 없었어요." }).eq("id", m.id).eq("payment_status", "PAID");
      await logStatus({ entityType: "application", entityId: m.id, field: "match_status", from: "CONFIRMED", to: "ALTERNATIVE_OFFERED", actor, reason: "확정 후 취소로 인원 부족, 옮길 테이블 없음" });
      await notify({ userId: m.user_id, template: "alternative", title: "테이블 인원이 모자라졌어요", body: "함께하기로 한 분이 취소해 모임을 열 수 없게 됐어요. 다른 일정으로 옮기거나, 이용권을 보관하거나, 환불받을 수 있어요.", link: `/applications/${m.id}/resolve`, dedupeKey: `reflow-alt:${m.id}` });
      offered++;
    }
  }
  await db().from("dining_tables").update({ status: "DISSOLVED" }).eq("id", tableId);
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", to: "DISSOLVED", actor, reason: `인원 부족 해제: ${moved}명 재배치, ${offered}명 대안 안내` });
  return { moved, offered };
}
