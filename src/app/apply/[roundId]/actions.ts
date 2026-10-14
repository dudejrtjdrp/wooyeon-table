"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { PASSES, type PassType } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { db } from "@/lib/supabase";

export async function submitApplication(form: FormData) {
  const me = await requireProfile();
  const roundId = String(form.get("round_id"));
  const slotIds = form.getAll("slot_ids").map(String);
  const pass = String(form.get("pass")) as PassType;
  const back = (m: string) => redirect(`/apply/${roundId}?e=${encodeURIComponent(m)}`);

  const { data: round } = await db().from("rounds").select("id,title,apply_deadline,status,slots(id)").eq("id", roundId).maybeSingle();
  if (!round || round.status !== "open") back("모집이 끝난 일정이에요");
  if (new Date(round!.apply_deadline) <= (await now())) back("신청 마감 시간이 지났어요");
  const valid = new Set((round!.slots ?? []).map((s: { id: string }) => s.id));
  const chosen = slotIds.filter((id) => valid.has(id));
  if (chosen.length === 0) back("참가할 수 있는 날짜와 동네를 하나 이상 골라 주세요");
  if (!(pass in PASSES)) back("이용권을 골라 주세요");
  if (form.get("agree_refund") !== "on") back("환불 규정을 확인해 주세요");

  const { data: existing } = await db().from("applications").select("id").eq("user_id", me.id).eq("round_id", roundId).maybeSingle();
  if (existing) redirect(`/applications/${existing.id}`);

  // 결제 대기 건을 먼저 만든다. 실제 승인은 결제 화면에서
  const { data: payment } = await db()
    .from("payments")
    .insert({ user_id: me.id, amount: PASSES[pass].amount, pass_type: pass, status: "PENDING", provider: "mock" })
    .select("id")
    .single();

  const { data: app, error } = await db()
    .from("applications")
    .insert({
      user_id: me.id,
      round_id: roundId,
      payment_id: payment!.id,
      application_status: "SUBMITTED",
      payment_status: "PENDING",
      match_status: "WAITING",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !app) back("신청을 저장하지 못했어요. 다시 시도해 주세요");

  await db().from("application_slots").insert(chosen.map((slot_id) => ({ application_id: app!.id, slot_id })));
  await db().from("payments").update({ idempotency_key: `app:${app!.id}` }).eq("id", payment!.id);
  await logStatus({ entityType: "application", entityId: app!.id, field: "application_status", from: "DRAFT", to: "SUBMITTED", actor: `user:${me.id}`, reason: `${chosen.length}개 일정 선택` });
  await notify({
    userId: me.id,
    template: "applied",
    title: "신청이 접수됐어요",
    body: `${round!.title} 신청을 받았어요. 결제를 마치면 매칭 대상이 돼요.`,
    link: `/pay/${app!.id}`,
    dedupeKey: `applied:${app!.id}`,
  });
  redirect(`/pay/${app!.id}`);
}
