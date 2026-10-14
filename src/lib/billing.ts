// 이용권과 환불. 1회권은 돈으로 돌려주고, 정기권(또는 보유 이용권으로 신청한 건)은 쓴 횟수를 돌려준다.
import { won } from "./constants";
import { logStatus } from "./events";
import { db } from "./supabase";

type PayRow = { id: string; status: string; amount: number; pass_type: string | null; pass_id: string | null };

/** 신청에 쓴 결제를 되돌린다. 무엇을 했는지 사람이 읽을 문장으로 돌려준다 */
export async function releaseUse(appId: string, actor: string, reason: string): Promise<string> {
  const { data } = await db()
    .from("applications")
    .select("id,payment_status,payments(id,status,amount,pass_type,pass_id)")
    .eq("id", appId)
    .single();
  const app = data as unknown as { id: string; payment_status: string; payments: PayRow | null };
  const p = app?.payments;
  if (!p || app.payment_status !== "PAID") return "결제 전이라 따로 돌려드릴 금액은 없어요.";

  const returnsUse = p.amount === 0 || p.pass_type === "subscription";
  if (returnsUse && p.pass_id) {
    const { data: pass } = await db().from("passes").select("remaining").eq("id", p.pass_id).single();
    await db().from("passes").update({ remaining: (pass?.remaining ?? 0) + 1 }).eq("id", p.pass_id);
    await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId).eq("payment_status", "PAID");
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUNDED", actor, reason: `${reason}: 이용권 1회 반환` });
    return "쓴 이용권 1회를 돌려드렸어요. 다음 일정에 그대로 쓸 수 있어요.";
  }
  // 1회권: 원결제수단으로 전액 환불 (모의 PG라 바로 완료)
  const { data: up } = await db()
    .from("payments")
    .update({ status: "REFUNDED", refunded_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("status", "PAID")
    .select("id");
  if (up?.length) {
    if (p.pass_id) await db().from("passes").update({ remaining: 0 }).eq("id", p.pass_id);
    await db().from("applications").update({ payment_status: "REFUNDED" }).eq("id", appId);
    await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUNDED", actor: "system", reason: `${reason}: 원결제수단 전액 환불 ${won(p.amount)}(모의)` });
  }
  return `결제하신 수단으로 ${won(p.amount)}을 전액 돌려드렸어요.`;
}

/** 지금 쓸 수 있는 보유 이용권 (남은 횟수가 있고 기한이 안 지난 것, 기한이 빠른 순) */
export async function usablePass(userId: string, at: Date) {
  const { data } = await db()
    .from("passes")
    .select("id,pass_type,remaining,total_count,expires_at")
    .eq("user_id", userId)
    .gt("remaining", 0)
    .order("expires_at", { ascending: true });
  return (data ?? []).find((p) => !p.expires_at || new Date(p.expires_at) > at) ?? null;
}
