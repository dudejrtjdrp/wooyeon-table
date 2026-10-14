// 토스 결제창에서 결제를 못 했을 때 돌아오는 곳. 사용자가 닫은 경우는 실패로 기록하지 않는다.
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const appId = q.get("app") ?? "";
  const code = q.get("code") ?? "";
  const message = q.get("message") ?? "결제를 끝내지 못했어요";
  const me = await getMe();
  if (me && code !== "PAY_PROCESS_CANCELED" && code !== "USER_CANCEL") {
    const { data: app } = await db().from("applications").select("id,user_id,payment_id").eq("id", appId).maybeSingle();
    if (app && app.user_id === me.id) {
      const { data: up } = await db().from("payments").update({ status: "FAILED" }).eq("id", app.payment_id).eq("status", "PENDING").select("id");
      if (up?.length) {
        await db().from("applications").update({ payment_status: "FAILED" }).eq("id", appId);
        await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PENDING", to: "FAILED", actor: `user:${me.id}`, reason: `토스 결제 실패 ${code}` });
      }
    }
  }
  const text = code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL" ? "결제를 취소했어요. 준비되면 다시 결제해 주세요" : message;
  return NextResponse.redirect(new URL(`/pay/${appId}?e=${encodeURIComponent(text)}`, req.nextUrl.origin));
}
