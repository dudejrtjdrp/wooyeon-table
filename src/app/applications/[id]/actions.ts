"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { db } from "@/lib/supabase";

/**
 * 매칭 전 신청 취소. 매칭 시각 전, 매칭 대기 상태일 때만 된다.
 * 결제했으면 이용권 1회를 돌려주거나(정기권) 원결제수단으로 환불(모의)한다.
 */
export async function cancelApplication(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,payment_status,payment_id,rounds(title,match_at),payments(id,pass_id,status)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; match_status: string; payment_status: string; payment_id: string | null;
    rounds: { title: string; match_at: string };
    payments: { id: string; pass_id: string | null; status: string } | null;
  } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  const back = (m: string) => redirect(`/applications/${appId}?e=${encodeURIComponent(m)}`);
  if (app.match_status !== "WAITING") back("매칭이 시작된 뒤에는 신청을 취소할 수 없어요");
  if (new Date(app.rounds.match_at) <= (await now())) back("매칭 시각이 지나 취소할 수 없어요");

  // 조건부 업데이트: 매칭과 동시에 눌려도 한쪽만 이긴다
  const { data: up } = await db()
    .from("applications")
    .update({ application_status: "CANCELED", match_status: "NO_MATCH", resolution: "canceled" })
    .eq("id", appId)
    .eq("match_status", "WAITING")
    .select("id");
  if (!up?.length) redirect(`/applications/${appId}`);
  await logStatus({ entityType: "application", entityId: appId, field: "application_status", from: "SUBMITTED", to: "CANCELED", actor: `user:${me.id}`, reason: "매칭 전 취소" });

  let body = "결제 전이라 따로 환불할 금액은 없어요.";
  if (app.payment_status === "PAID" && app.payments) {
    if (app.payments.pass_id) {
      const { data: pass } = await db().from("passes").select("remaining").eq("id", app.payments.pass_id).single();
      await db().from("passes").update({ remaining: (pass?.remaining ?? 0) + 1 }).eq("id", app.payments.pass_id);
      body = "쓴 이용권 1회를 돌려드렸어요. 다음 일정에 그대로 쓸 수 있어요.";
    } else {
      await db().from("payments").update({ status: "REFUNDED", refunded_at: new Date().toISOString() }).eq("id", app.payments.id).eq("status", "PAID");
      await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId);
      await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUNDED", actor: "system", reason: "매칭 전 취소로 전액 환불(모의)" });
      body = "결제하신 수단으로 전액 돌려드렸어요.";
    }
  }
  await notify({ userId: me.id, template: "canceled", title: "신청을 취소했어요", body: `${app.rounds.title} 신청을 취소했어요. ${body}`, link: "/rounds", dedupeKey: `canceled:${appId}` });
  redirect(`/applications/${appId}`);
}
