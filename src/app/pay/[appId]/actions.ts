"use server";

import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";
import { requireProfile } from "@/lib/auth";
import { type PassType } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { markPaid } from "@/lib/payments";
import { now } from "@/lib/clock";
import { db } from "@/lib/supabase";

async function load(appId: string, userId: string) {
  const { data: app } = await db()
    .from("applications")
    .select("id,user_id,payment_id,payment_status,rounds(title,match_at),payments(id,status,pass_type,amount)")
    .eq("id", appId)
    .maybeSingle();
  if (!app || app.user_id !== userId) redirect("/");
  if (new Date((app as unknown as { rounds: { match_at: string } }).rounds.match_at) <= (await now())) redirect(`/pay/${appId}`);
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
  const paid = await markPaid(appId, me.id, { provider: "mock", method: String(form.get("method") ?? "card"), reason: "모의 결제 승인" });
  // 시연: 같은 일정에 봇이 같이 신청한다 (lib/sim/bots.ts, 운영자 시연 패널에서 끔)
  if (paid) after(() => import("@/lib/sim/bots").then((b) => b.botsJoin(appId)).catch((e) => console.error("[bots] 같이 신청 실패", e)));
  // 결제 화면 기록을 내 신청으로 바꾼다: 뒤로 가기가 이미 끝난 결제 화면(곧장 다시 넘어감)에 걸리지 않게
  redirect(`/applications/${appId}`, RedirectType.replace);
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
