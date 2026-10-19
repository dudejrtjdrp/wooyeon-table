"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { applicationLive, cleanNote, manualRefundCheck } from "@/lib/cancel-rules";
import { now } from "@/lib/clock";
import { isMembership } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { adminBack } from "@/lib/members";
import { refundPayment } from "@/lib/payments";
import { db } from "@/lib/supabase";

/**
 * 운영자 수동 환불. 결제 완료 건만, 사유를 꼭 받는다. 환불은 자동 환불과 같은 refundPayment로 한다(토스면 토스 취소 API).
 * 결제사에서 실패하면 자동 재시도를 기다리지 않고 바로 예외 처리함(환불 실패)에 올린다. 재시도가 성공하면 그 예외는 자동으로 닫힌다.
 * 멤버십을 돈으로 돌려주면 그 멤버십 기간도 바로 끝낸다(안 그러면 환불받고도 계속 신청할 수 있다).
 */
export async function manualRefund(form: FormData) {
  const back = adminBack(form.get("back"), "/admin/payments");
  const admin = await requireAdminWrite(back);
  const go = (k: "m" | "e", msg: string) => {
    revalidatePath("/admin/payments");
    revalidatePath("/admin/exceptions");
    revalidatePath("/admin");
    redirect(`${back}${back.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
  };
  const paymentId = String(form.get("payment_id"));
  const note = cleanNote(form.get("note"));
  if (!note) return go("e", "환불 사유를 4자 이상 적어 주세요. 상태 이력에 그대로 남아요");

  const { data } = await db().from("payments").select("id,status,provider,amount,pass_type,pass_id,users(name),applications(id,application_status,match_status,attendance_status)").eq("id", paymentId).maybeSingle();
  type AppState = { id: string; application_status: string; match_status: string; attendance_status: string | null };
  const p = data as unknown as { id: string; status: string; provider: string; amount: number; pass_type: string | null; pass_id: string | null; users: { name: string } | null; applications: AppState[] } | null;
  if (!p) return go("e", "결제를 찾지 못했어요");
  const asState = (a: AppState) => ({ applicationStatus: a.application_status, matchStatus: a.match_status, attendanceStatus: a.attendance_status });
  // 멤버십이면 그 멤버십(이용권)으로 낸 다른 신청 중 진행 중인 것
  let passLive = 0;
  if (isMembership(p.pass_type) && p.pass_id) {
    const { data: others } = await db().from("payments").select("id,applications(id,application_status,match_status,attendance_status)").eq("pass_id", p.pass_id).neq("id", p.id);
    passLive = ((others ?? []) as unknown as { applications: AppState[] }[]).flatMap((x) => x.applications).filter((a) => applicationLive(asState(a))).length;
  }
  const check = manualRefundCheck({ status: p.status, provider: p.provider, amount: p.amount, hasApplication: p.applications.length > 0, application: p.applications[0] && asState(p.applications[0]), passLive });
  if (!check.ok) return go("e", check.message);

  const appId = p.applications[0].id;
  const actor = `admin:${admin.id}`;
  const r = await refundPayment(p.id, appId, actor, `운영자 수동 환불: ${note}`);
  if (!r.ok) {
    const { data: after } = await db().from("payments").select("status,refund_error").eq("id", p.id).single();
    if (after?.status === "REFUND_FAILED") {
      await db().from("exceptions").upsert(
        { kind: "refund", ref_type: "application", ref_id: appId, reason: `운영자 수동 환불이 결제사에서 안 됐어요: ${after.refund_error ?? "사유 없음"}`, dedupe_key: `refund:${p.id}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
      return go("e", "결제사에서 환불이 안 됐어요. 예외 처리함에 올렸고, 10분 뒤 자동으로 다시 시도해요");
    }
    return go("e", r.message);
  }
  if (isMembership(p.pass_type) && p.pass_id) {
    const { data: pass } = await db().from("passes").select("expires_at").eq("id", p.pass_id).single();
    const end = (await now()).toISOString();
    await db().from("passes").update({ expires_at: end }).eq("id", p.pass_id);
    await logStatus({ entityType: "pass", entityId: p.pass_id, field: "expires_at", from: pass?.expires_at ?? null, to: end, actor, reason: `멤버십 환불로 기간 종료: ${note}` });
  }
  return go("m", `${p.users?.name ?? "참가자"}님께 ${r.message.replace(/^결제하신 수단으로 /, "결제한 수단으로 ")}`);
}
