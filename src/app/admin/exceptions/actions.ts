"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { refundPayment } from "@/lib/payments";
import { assignVenue, afterConfirm } from "@/lib/pipeline";
import { db } from "@/lib/supabase";

async function close(id: string, adminId: string, resolution: string) {
  await db().from("exceptions").update({ status: "resolved", resolution, resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("id", id);
}

export async function resolveException(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get("id"));
  const action = String(form.get("action"));
  const note = String(form.get("note") ?? "").trim();
  const { data: ex } = await db().from("exceptions").select("*").eq("id", id).single();
  if (!ex) return;
  const actor = `admin:${me.id}`;

  if (ex.kind === "no_show" && ex.ref_type === "user") {
    // 노쇼 3회 이상: 영구 제한 검토
    const ban = action === "ban";
    await db().from("users").update(ban ? { account_status: "banned", restricted_until: null } : { account_status: "warned", restricted_until: null }).eq("id", ex.ref_id);
    await logStatus({ entityType: "user", entityId: ex.ref_id, field: "account_status", from: "restricted", to: ban ? "banned" : "warned", actor, reason: note || (ban ? "노쇼 반복으로 영구 제한" : "소명 확인, 제한 해제") });
    await close(id, me.id, ban ? "영구 제한" : "제한 해제");
  } else if (ex.kind === "no_show") {
    const to = action === "attended" ? "ATTENDED" : "NO_SHOW";
    await db().from("applications").update({ attendance_status: to }).eq("id", ex.ref_id);
    await logStatus({ entityType: "application", entityId: ex.ref_id, field: "attendance_status", from: "SCHEDULED", to, actor, reason: note || "운영자 확인" });
    await close(id, me.id, to === "NO_SHOW" ? "노쇼 확정" : "참석으로 정정");
    if (to === "NO_SHOW") {
      const { data: app } = await db().from("applications").select("user_id").eq("id", ex.ref_id).single();
      if (app) {
        const { applyNoShowPolicy } = await import("@/lib/noshow");
        await applyNoShowPolicy(app.user_id, ex.ref_id, actor);
      }
    }
  } else if (ex.kind === "safety") {
    const { data: rep } = await db().from("safety_reports").select("reported_id").eq("id", ex.ref_id).single();
    const level = ["warning", "restricted", "banned"].includes(action) ? action : "none";
    await db().from("safety_reports").update({ status: "reviewed", action: level, admin_note: note || null, reviewed_at: new Date().toISOString() }).eq("id", ex.ref_id);
    if (rep && level !== "none") {
      const status = level === "warning" ? "warned" : level;
      await db().from("users").update({ account_status: status }).eq("id", rep.reported_id);
      await logStatus({ entityType: "user", entityId: rep.reported_id, field: "account_status", to: status, actor, reason: note || "안전 신고 검토" });
    }
    await close(id, me.id, `신고 검토: ${level}`);
  } else if (ex.kind === "venue_shortage" && action === "retry") {
    const ok = await assignVenue(ex.ref_id);
    if (ok) {
      await afterConfirm(ex.ref_id);
      await close(id, me.id, "식당 재배정");
    }
  } else if (ex.kind === "reservation" && action === "retry_reservation") {
    const { resetAndRetry } = await import("@/lib/reservations");
    await resetAndRetry(ex.ref_id, me.id);
    const { data: r } = await db().from("reservations").select("status").eq("table_id", ex.ref_id).maybeSingle();
    if (r?.status === "CONFIRMED") await close(id, me.id, "예약 다시 시도 성공");
  } else if (ex.kind === "reservation" && action === "reserved") {
    const { markReservedManually } = await import("@/lib/reservations");
    await markReservedManually(ex.ref_id, note, me.id);
  } else if (ex.kind === "notification" && action === "resend") {
    // 알림 발송 실패: 운영자가 원인을 보고 다시 보낸다 (INF-08)
    let ok = false;
    if (ex.ref_type === "chat_room") {
      const { resendSystem } = await import("@/lib/delivery");
      ok = await resendSystem(ex.dedupe_key ?? "");
    } else if (ex.ref_type === "notification") {
      // 알림함 저장이 실패했던 알림(failed)은 알림함에 넣고, 푸시도 다시 보낸다. 등록 기기가 없으면 알림함만으로 성공
      const { pushNotifications } = await import("@/lib/push");
      const { data: before } = await db().from("notifications").select("status,sent_at").eq("id", ex.ref_id).maybeSingle();
      if (before) {
        const { error } = await db()
          .from("notifications")
          .update({ status: "sent", sent_at: before.status === "sent" ? before.sent_at : new Date().toISOString(), last_error: null })
          .eq("id", ex.ref_id);
        if (!error) {
          await pushNotifications([ex.ref_id]);
          const { data: n } = await db().from("notifications").select("status,last_error").eq("id", ex.ref_id).maybeSingle();
          ok = n?.status === "sent" && !n.last_error;
        }
      }
    }
    await logStatus({ entityType: "exception", entityId: id, field: "resend", to: ok ? "SENT" : "FAILED", actor, reason: note || "운영자가 다시 보내기" });
    if (ok) await close(id, me.id, "다시 보내기 성공");
    else {
      revalidatePath("/admin/exceptions");
      redirect(`/admin/exceptions?m=${encodeURIComponent("다시 보내지 못했어요. 사유를 확인하고 직접 연락해 주세요")}`);
    }
  } else if (ex.kind === "refund" && action === "retry_refund") {
    const { data: app } = await db().from("applications").select("id,user_id,payment_id").eq("id", ex.ref_id).single();
    if (app) {
      const r = await refundPayment(app.payment_id, app.id, actor, note || "운영자 환불 재시도");
      if (r.ok) {
        await notify({ userId: app.user_id, template: "refunded", title: "환불이 끝났어요", body: r.message, link: `/applications/${app.id}`, dedupeKey: `refunded:${app.id}:retry` });
        await close(id, me.id, "환불 재시도 성공");
      }
    }
  } else {
    await close(id, me.id, note || "운영자 처리");
  }
  revalidatePath("/admin/exceptions");
}
