"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { type PassType } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { markPaid } from "@/lib/payments";
import { db } from "@/lib/supabase";

async function load(appId: string, userId: string) {
  const { data: app } = await db()
    .from("applications")
    .select("id,user_id,payment_id,payment_status,rounds(title,match_at),payments(id,status,pass_type,amount)")
    .eq("id", appId)
    .maybeSingle();
  if (!app || app.user_id !== userId) redirect("/");
  return app as unknown as {
    id: string; payment_id: string; payment_status: string;
    rounds: { title: string; match_at: string };
    payments: { id: string; status: string; pass_type: PassType; amount: number };
  };
}

/** 모의 결제(시연용 즉시 승인). 같은 결제를 두 번 눌러도 한 번만 승인된다 */
export async function pay(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  await load(appId, me.id);
  await markPaid(appId, me.id, { provider: "mock", method: String(form.get("method") ?? "card"), reason: "모의 결제 승인" });
  redirect(`/applications/${appId}`);
}

/** 시연용: 결제 실패를 일부러 일으킨다 */
export async function failPayment(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const app = await load(appId, me.id);
  const { data: updated } = await db()
    .from("payments")
    .update({ status: "FAILED" })
    .eq("id", app.payment_id)
    .eq("status", "PENDING")
    .select("id");
  if (updated?.length) {
    await db().from("applications").update({ payment_status: "FAILED" }).eq("id", appId);
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PENDING", to: "FAILED", actor: `user:${me.id}`, reason: "카드 승인 거절(시연)" });
  }
  redirect(`/pay/${appId}?e=${encodeURIComponent("카드 승인이 거절됐어요. 다른 결제수단으로 다시 시도해 주세요")}`);
}
