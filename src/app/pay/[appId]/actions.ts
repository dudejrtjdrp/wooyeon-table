"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PASSES, type PassType } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { fmtDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
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

/** 모의 결제. 같은 결제를 두 번 눌러도 한 번만 승인된다 */
export async function pay(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const app = await load(appId, me.id);

  // 대기·실패 상태일 때만 승인으로 바꾼다 (조건부 업데이트 = 중복 승인 방지)
  const { data: updated } = await db()
    .from("payments")
    .update({ status: "PAID", paid_at: new Date().toISOString() })
    .eq("id", app.payment_id)
    .in("status", ["PENDING", "FAILED"])
    .select("id");
  if (updated?.length) {
    const passDef = PASSES[app.payments.pass_type] ?? PASSES.single;
    const { data: pass } = await db()
      .from("passes")
      .insert({
        user_id: me.id,
        pass_type: app.payments.pass_type,
        total_count: passDef.count,
        remaining: passDef.count - 1, // 이번 신청에 1회 사용
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
      })
      .select("id")
      .single();
    await db().from("payments").update({ pass_id: pass!.id }).eq("id", app.payment_id);
    await db().from("applications").update({ payment_status: "PAID" }).eq("id", appId);
    // 결제했으니 예약해 둔 결제 독촉 알림은 보내지 않는다
    await db().from("notifications").delete().eq("status", "pending").like("dedupe_key", `payment_pending:${appId}:%`);
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: app.payment_status, to: "PAID", actor: `user:${me.id}`, reason: "모의 결제 승인" });
    await notify({
      userId: me.id,
      template: "paid",
      title: "결제가 끝났어요",
      body: `${fmtDateTime(app.rounds.match_at)}에 자동으로 테이블을 꾸려서 알려드릴게요.`,
      link: `/applications/${appId}`,
      dedupeKey: `paid:${appId}`,
    });
  }
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
