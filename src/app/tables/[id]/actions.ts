"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pushToUsers } from "@/lib/push";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { ensureRoom } from "@/lib/pipeline";
import { db } from "@/lib/supabase";

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
    await pushToUsers((others ?? []).map((o) => o.user_id), { title: `${me.name}님의 새 메시지`, body: body.slice(0, 80), url: `/tables/${tableId}`, tag: `chat-${tableId}` }).catch(() => null);
  });
  revalidatePath(`/tables/${tableId}`);
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
    .update({ attendance_status: "ATTENDED" })
    .eq("id", m!.id)
    .eq("attendance_status", "SCHEDULED")
    .select("id");
  if (up?.length) {
    await logStatus({ entityType: "application", entityId: m!.id, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: `user:${me.id}`, reason: "앱 체크인" });
  }
  revalidatePath(`/tables/${tableId}`);
}
