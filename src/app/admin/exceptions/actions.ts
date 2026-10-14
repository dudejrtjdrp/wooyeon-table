"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
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

  if (ex.kind === "no_show") {
    const to = action === "attended" ? "ATTENDED" : "NO_SHOW";
    await db().from("applications").update({ attendance_status: to }).eq("id", ex.ref_id);
    await logStatus({ entityType: "application", entityId: ex.ref_id, field: "attendance_status", from: "SCHEDULED", to, actor, reason: note || "운영자 확인" });
    await close(id, me.id, to === "NO_SHOW" ? "노쇼 확정" : "참석으로 정정");
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
  } else {
    await close(id, me.id, note || "운영자 처리");
  }
  revalidatePath("/admin/exceptions");
}
