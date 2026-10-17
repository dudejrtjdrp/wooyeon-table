"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pushToUsers } from "@/lib/push";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { canClaimAttended } from "@/lib/attendance-rules";
import { logStatus } from "@/lib/events";
import { fmtDateTime } from "@/lib/format";
import { ensureRoom } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { postSystem } from "@/lib/delivery";

async function membership(tableId: string, userId: string) {
  const { data } = await db()
    .from("applications")
    .select("id,attendance_status")
    .eq("table_id", tableId)
    .eq("user_id", userId)
    .eq("match_status", "CONFIRMED")
    .maybeSingle();
  return data;
}

export async function sendMessage(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const body = String(form.get("body") ?? "").trim().slice(0, 500);
  if (!body) return;
  if (!(await membership(tableId, me.id))) redirect("/");
  const roomId = await ensureRoom(tableId);
  await db().from("chat_messages").insert({ room_id: roomId, sender_id: me.id, kind: "user", body });
  // 같은 테이블의 다른 사람들에게 푸시 (화면 응답 뒤에 보낸다)
  after(async () => {
    const { data: others } = await db().from("applications").select("user_id").eq("table_id", tableId).eq("match_status", "CONFIRMED").neq("user_id", me.id);
    await pushToUsers((others ?? []).map((o) => o.user_id), { title: `${me.name}님의 새 메시지`, body: body.slice(0, 80), url: `/tables/${tableId}/chat`, tag: `chat-${tableId}` }).catch(() => null);
  });
  revalidatePath(`/tables/${tableId}`);
  revalidatePath(`/tables/${tableId}/chat`);
}

/**
 * 당일 '늦을 것 같아요' (성효님 결정: 당일 취소는 막고, 늦으면 단체방에 알린다).
 * 모임 당일 시작 전후로만, 한 사람이 한 번만 보낸다. 연락 없이 안 오면 노쇼로 처리된다.
 */
export async function lateNotice(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const m = await membership(tableId, me.id);
  if (!m) redirect("/");
  const { data: t } = await db().from("dining_tables").select("slots(starts_at,ends_at)").eq("id", tableId).single();
  const s = (t as unknown as { slots: { starts_at: string; ends_at: string } }).slots;
  const n = await now();
  const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  if (kst(n) !== kst(new Date(s.starts_at)) || n > new Date(s.ends_at)) redirect(`/tables/${tableId}/chat?e=${encodeURIComponent("모임 당일에만 보낼 수 있어요")}`);
  const { data: sent } = await db().from("status_events").select("id").eq("entity_type", "dining_table").eq("entity_id", tableId).eq("field", "late").eq("to_value", me.id).limit(1);
  if (!sent?.length) {
    const roomId = await ensureRoom(tableId);
    await postSystem(roomId, `${me.name}님이 조금 늦을 것 같대요\n먼저 주문하고 이야기 나누고 계세요.`);
    await logStatus({ entityType: "dining_table", entityId: tableId, field: "late", to: me.id, actor: `user:${me.id}`, reason: "늦을 것 같아요" });
  }
  revalidatePath(`/tables/${tableId}/chat`);
  redirect(`/tables/${tableId}/chat?m=${encodeURIComponent("늦는다고 알렸어요")}`);
}

/** 앱 체크인으로 참석 기록 (FDB-01). 시작 1시간 전부터 끝날 때까지 가능 */
export async function checkIn(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const m = await membership(tableId, me.id);
  if (!m) redirect("/");
  const { data: t } = await db().from("dining_tables").select("slots(starts_at,ends_at)").eq("id", tableId).single();
  const s = (t as unknown as { slots: { starts_at: string; ends_at: string } }).slots;
  const n = await now();
  const open = new Date(new Date(s.starts_at).getTime() - 60 * 60 * 1000);
  if (n < open || n > new Date(s.ends_at)) {
    redirect(`/tables/${tableId}?e=${encodeURIComponent("체크인은 모임 1시간 전부터 끝날 때까지 할 수 있어요")}`);
  }
  const { data: up } = await db()
    .from("applications")
    .update({ attendance_status: "ATTENDED", checked_in_at: n.toISOString() })
    .eq("id", m!.id)
    .eq("attendance_status", "SCHEDULED")
    .select("id");
  if (up?.length) {
    await logStatus({ entityType: "application", entityId: m!.id, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: `user:${me.id}`, reason: "앱 체크인" });
  }
  revalidatePath(`/tables/${tableId}`);
}

/**
 * 갔는데 체크인을 깜빡한 사람: 모임이 끝나고 48시간 안에 '참석했어요'라고 알린다.
 * 바로 참석으로 바꾸지 않고(노쇼를 가릴 수 없어서) 노쇼 후보 예외에 본인 확인을 붙여 운영자가 정한다.
 */
export async function claimAttended(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const m = await membership(tableId, me.id);
  if (!m) redirect("/");
  const { data: t } = await db().from("dining_tables").select("slots(ends_at)").eq("id", tableId).single();
  const end = new Date((t as unknown as { slots: { ends_at: string } }).slots.ends_at);
  const n = await now();
  if (!canClaimAttended(m.attendance_status, end, n)) redirect(`/tables/${tableId}`);
  // 이미 알린 사람은 다시 기록하지 않는다 (두 번 눌러도 한 번)
  const { data: prev } = await db().from("status_events").select("id").eq("entity_id", m.id).eq("field", "attendance_claim").limit(1);
  if (prev?.length) redirect(`/tables/${tableId}`);
  const when = fmtDateTime(n.toISOString()); // 서버 시간대와 상관없이 서울 시각
  const note = `${me.name}님 체크인 기록이 없어요 · 본인이 '참석했는데 체크인을 못 했어요'라고 알림(${when})`;
  const { data: ex } = await db().from("exceptions").select("id,status").eq("dedupe_key", `noshow:${m.id}`).maybeSingle();
  if (ex) {
    if (ex.status === "open") await db().from("exceptions").update({ reason: note }).eq("id", ex.id);
  } else {
    await db().from("exceptions").insert({ kind: "no_show", ref_type: "application", ref_id: m.id, reason: note, dedupe_key: `noshow:${m.id}` });
  }
  await logStatus({ entityType: "application", entityId: m.id, field: "attendance_claim", from: "SCHEDULED", to: "CLAIMED", actor: `user:${me.id}`, reason: "참석했는데 체크인을 못 했다고 알림" });
  revalidatePath(`/tables/${tableId}`);
  redirect(`/tables/${tableId}?m=${encodeURIComponent("알려 주셔서 고마워요. 운영팀이 확인하면 참석으로 바뀌고 후기를 남길 수 있어요")}`);
}

