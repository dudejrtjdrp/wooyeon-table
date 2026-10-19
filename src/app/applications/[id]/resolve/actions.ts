"use server";

import { euro } from "@/lib/korean";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { refundPayment } from "@/lib/payments";
import { joinTable, keepPassFor, startWaiting } from "@/lib/resolve";
import { isMembership } from "@/lib/constants";
import { fmtSlot } from "@/lib/format";
import { kstDay } from "@/lib/regions";
import { loadTemplates, render } from "@/lib/templates";
import { db } from "@/lib/supabase";

async function loadOwn(appId: string, userId: string) {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,payment_status,payment_id,round_id,near_ok,payments(id,pass_id,pass_type,status,amount)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; match_status: string; payment_status: string; payment_id: string; round_id: string; near_ok: boolean | null;
    payments: { id: string; pass_id: string | null; pass_type: string | null; status: string; amount: number };
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

  const { data: slots } = await db().from("slots").select("id,round_id,region,starts_at,rounds(status,apply_deadline,title,match_at)").in("id", slotIds);
  const roundIds = [...new Set((slots ?? []).map((s) => s.round_id))];
  if (roundIds.length !== 1) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent("옮길 일정은 같은 주의 일정 안에서만 고를 수 있어요. 한 주씩 골라 주세요")}`);
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
    .update({ match_status: "TRANSFERRED", payment_status: "PAID", resolution: "transfer", wait_until: null })
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
      areas: [...new Set((slots ?? []).map((x) => x.region))],
      dates: [...new Set((slots ?? []).map((x) => kstDay(x.starts_at)))],
      near_ok: app.near_ok ?? false,
    })
    .select("id")
    .single();
  await db().from("application_slots").insert(slotIds.map((slot_id) => ({ application_id: next!.id, slot_id })));
  await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "ALTERNATIVE_OFFERED", to: "TRANSFERRED", actor: `user:${me.id}`, reason: `${euro(r.title)} 이동` });
  await logStatus({ entityType: "application", entityId: next!.id, field: "match_status", to: "WAITING", actor: `user:${me.id}`, reason: "이전 신청에서 일정 이동, 결제 유지" });
  const tm = render("transferred", { round: r.title, match_at: fmtSlot(r.match_at) }, await loadTemplates());
  await notify({ userId: me.id, template: "transferred", title: tm.title, body: tm.body, link: `/applications/${next!.id}`, dedupeKey: `transferred:${appId}` });
  redirect(`/applications/${next!.id}`);
}

/** 이용권 보관: 이번 신청에 쓴 1회를 돌려준다 */
export async function keepPass(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  await loadOwn(appId, me.id);
  await keepPassFor(appId, `user:${me.id}`, "choice");
  redirect(`/applications/${appId}`);
}

/** 빈자리가 있는 테이블에 바로 합류 */
export async function join(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const tableId = String(form.get("table_id") ?? "");
  await loadOwn(appId, me.id);
  const r = await joinTable(appId, tableId, `user:${me.id}`);
  if (!r.ok) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent(r.message)}`);
  redirect(`/tables/${tableId}?m=${encodeURIComponent("테이블에 합류했어요. 단체방에서 인사를 나눠 보세요")}`);
}

/** 자리 나면 알려 주기 (마감 있음) */
export async function wait(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  await loadOwn(appId, me.id);
  const r = await startWaiting(appId, `user:${me.id}`);
  if (!r.ok) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent(r.message)}`);
  redirect(`/applications/${appId}?m=${encodeURIComponent(r.message)}`);
}

/** 자동 환불 (PAY-03). 계좌 입력이나 운영자 승인 없이 원래 결제수단으로 (모의) */
export async function refund(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const app = await loadOwn(appId, me.id);
  // 멤버십 신청은 실패 때 기간을 늘려 주는 것으로 대신한다 (운영사 Q&A)
  if (isMembership(app.payments.pass_type)) redirect(`/applications/${appId}/resolve?e=${encodeURIComponent("멤버십은 환불 대신 기간을 늘려 드렸어요")}`);
  if (!["PAID", "REFUND_AVAILABLE", "REFUND_FAILED"].includes(app.payments.status)) redirect(`/applications/${appId}`);
  await db().from("applications").update({ payment_status: "REFUND_REQUESTED", match_status: "NO_MATCH", resolution: "refund", wait_until: null }).eq("id", appId);
  await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "REFUND_AVAILABLE", to: "REFUND_REQUESTED", actor: `user:${me.id}`, reason: "참가자가 환불 선택" });
  const r = await refundPayment(app.payment_id, appId, "system", "매칭 실패 후 환불 선택");
  if (r.ok) {
    if (app.payments.pass_id) await db().from("passes").update({ remaining: 0 }).eq("id", app.payments.pass_id);
  }
  // 환불 결과 알림(완료·다시 시도 중)은 refundPayment가 보낸다
  redirect(`/applications/${appId}`);
}
