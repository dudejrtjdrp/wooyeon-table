"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { refundPayment } from "@/lib/payments";
import { won } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";

async function loadOwn(appId: string, userId: string) {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,payment_status,payment_id,round_id,payments(id,pass_id,status,amount)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; match_status: string; payment_status: string; payment_id: string; round_id: string;
    payments: { id: string; pass_id: string | null; status: string; amount: number };
  } | null;
  if (!app || app.user_id !== userId) redirect("/");
  if (app.match_status !== "ALTERNATIVE_OFFERED") redirect(`/applications/${appId}`);
  return app;
}

/** 원클릭 일정 이동 (STA-06). 기존 결제를 그대로 두고 새 차수의 매칭 대기로 옮긴다 */
export async function transfer(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const slotIds = form.getAll("slot_ids").map(String);
  const app = await loadOwn(appId, me.id);
  if (!slotIds.length) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent("옮길 일정을 골라 주세요")}`);

  const { data: slots } = await db().from("slots").select("id,round_id,rounds(status,apply_deadline,title,match_at)").in("id", slotIds);
  const roundIds = [...new Set((slots ?? []).map((s) => s.round_id))];
  if (roundIds.length !== 1) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent("한 번에 한 차수의 일정만 고를 수 있어요")}`);
  const target = roundIds[0];
  const r = (slots![0] as unknown as { rounds: { status: string; apply_deadline: string; title: string; match_at: string } }).rounds;
  if (r.status !== "open" || new Date(r.apply_deadline) <= (await now())) {
    redirect(`/applications/${appId}/resolve?e=${encodeURIComponent("이미 마감된 일정이에요")}`);
  }
  const { data: dup } = await db().from("applications").select("id").eq("user_id", me.id).eq("round_id", target).maybeSingle();
  if (dup) redirect(`/applications/${dup.id}`);

  // 기존 신청을 먼저 닫는다 (조건부: 두 번 눌러도 한 번만 이동)
  const { data: closed } = await db()
    .from("applications")
    .update({ match_status: "TRANSFERRED", payment_status: "PAID", resolution: "transfer" })
    .eq("id", appId)
    .eq("match_status", "ALTERNATIVE_OFFERED")
    .select("id");
  if (!closed?.length) redirect(`/applications/${appId}`);

  const { data: next } = await db()
    .from("applications")
    .insert({
      user_id: me.id,
      round_id: target,
      payment_id: app.payment_id,
      application_status: "SUBMITTED",
      payment_status: "PAID",
      match_status: "WAITING",
      transferred_from: appId,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  await db().from("application_slots").insert(slotIds.map((slot_id) => ({ application_id: next!.id, slot_id })));
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "TRANSFERRED", actor: `user:${me.id}`, reason: `${r.title}로 이동` });
  await logStatus({ entityType: "application", entityId: next!.id, field: "match_status", to: "WAITING", actor: `user:${me.id}`, reason: "이전 신청에서 일정 이동, 결제 유지" });
  await notify({ userId: me.id, template: "transferred", title: "일정을 옮겼어요", body: `${r.title}로 옮겼어요. 결제는 그대로 유지되고, ${fmtDateTime(r.match_at)}에 자동으로 테이블을 꾸려요.`, link: `/applications/${next!.id}`, dedupeKey: `transferred:${appId}` });
  redirect(`/applications/${next!.id}`);
}

/** 이용권 보관: 이번 신청에 쓴 1회를 돌려준다 */
export async function keepPass(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const app = await loadOwn(appId, me.id);
  const { data: up } = await db()
    .from("applications")
    .update({ match_status: "NO_MATCH", payment_status: "PAID", resolution: "keep_pass" })
    .eq("id", appId)
    .eq("match_status", "ALTERNATIVE_OFFERED")
    .select("id");
  if (up?.length && app.payments.pass_id) {
    const { data: pass } = await db().from("passes").select("remaining").eq("id", app.payments.pass_id).single();
    await db().from("passes").update({ remaining: (pass?.remaining ?? 0) + 1 }).eq("id", app.payments.pass_id);
    await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "NO_MATCH", actor: `user:${me.id}`, reason: "이용권 보관" });
    await notify({ userId: me.id, template: "kept", title: "이용권을 보관했어요", body: "다음 일정을 신청할 때 그대로 쓸 수 있어요.", link: "/rounds", dedupeKey: `kept:${appId}` });
  }
  redirect(`/applications/${appId}`);
}

/** 자동 환불 (PAY-03). 계좌 입력이나 운영자 승인 없이 원래 결제수단으로 (모의) */
export async function refund(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const app = await loadOwn(appId, me.id);
  if (!["PAID", "REFUND_AVAILABLE", "REFUND_FAILED"].includes(app.payments.status)) redirect(`/applications/${appId}`);
  await db().from("applications").update({ payment_status: "REFUND_REQUESTED", match_status: "NO_MATCH", resolution: "refund" }).eq("id", appId);
  await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_AVAILABLE", to: "REFUND_REQUESTED", actor: `user:${me.id}`, reason: "참가자가 환불 선택" });
  const r = await refundPayment(app.payment_id, appId, "system", "매칭 실패 후 환불 선택");
  if (r.ok) {
    if (app.payments.pass_id) await db().from("passes").update({ remaining: 0 }).eq("id", app.payments.pass_id);
    await notify({ userId: me.id, template: "refunded", title: "환불이 끝났어요", body: `${won(app.payments.amount)}을 결제하신 수단으로 돌려드렸어요. 카드사에 따라 며칠 걸릴 수 있어요.`, link: `/applications/${appId}`, dedupeKey: `refunded:${appId}` });
  } else {
    await notify({ userId: me.id, template: "refund_failed", title: "환불을 다시 처리하고 있어요", body: r.message, link: `/applications/${appId}`, dedupeKey: `refund_failed:${appId}` });
  }
  redirect(`/applications/${appId}`);
}
