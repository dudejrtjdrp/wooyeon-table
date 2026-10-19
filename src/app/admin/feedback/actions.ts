"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { cleanNote } from "@/lib/cancel-rules";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { adminBack } from "@/lib/members";
import { reopenCheck, reopenReason } from "@/lib/safety-rules";
import { db } from "@/lib/supabase";

/** 돌아갈 주소에 결과 안내(?m= / ?e=)를 붙인다. 앞서 붙어 있던 안내는 지운다 */
const go = (back: string, k: "m" | "e", msg: string): never => {
  const [pathQ, hash] = back.split("#");
  const [path, q] = pathQ.split("?");
  const p = new URLSearchParams(q ?? "");
  p.delete("m");
  p.delete("e");
  p.set(k, msg);
  revalidatePath("/admin/feedback");
  revalidatePath("/admin/exceptions");
  revalidatePath("/admin");
  redirect(`${path}?${p.toString()}${hash ? `#${hash}` : ""}`);
};

/**
 * 닫은 안전 신고를 다시 연다 (PRD 11장 신고 검토). 신고는 '검토 전'으로, 예외 처리함 건도 다시 열어
 * 예외 처리함에서 새로 조치하게 한다. 이미 걸어 둔 계정 조치는 그대로 둔다(풀려면 회원 상세에서 바꾼다).
 * 신고·예외 둘 다 이력에 남긴다
 */
export async function reopenReport(form: FormData) {
  const back = adminBack(form.get("back"), "/admin/feedback");
  const admin = await requireAdminWrite(back);
  const id = String(form.get("report_id") ?? "");
  const note = cleanNote(form.get("note"));
  if (!note) return go(back, "e", "다시 여는 사유를 4자 이상 적어 주세요. 이력에 그대로 남아요");
  const { data: rep } = await db().from("safety_reports").select("id,status,action,admin_note,reason").eq("id", id).maybeSingle();
  const check = reopenCheck(rep);
  if (!check.ok) return go(back, "e", check.message);

  const actor = `admin:${admin.id}`;
  // 닫힌 상태일 때만 연다 (두 운영자가 동시에 눌러도 한 번만)
  const { data: opened } = await db().from("safety_reports").update({ status: "open", action: null, reviewed_at: null }).eq("id", id).eq("status", "reviewed").select("id");
  if (!opened?.length) return go(back, "m", "이미 다시 열린 신고예요");
  await logStatus({ entityType: "safety_report", entityId: id, field: "status", from: "reviewed", to: "open", actor, reason: reopenReason(rep!, note) });

  const t = (await now()).toISOString();
  const { data: ex } = await db().from("exceptions").select("id,status").eq("dedupe_key", `safety:${id}`).maybeSingle();
  if (ex) {
    if (ex.status !== "open") {
      await db().from("exceptions").update({ status: "open", resolution: null, resolved_by: null, resolved_at: null }).eq("id", ex.id);
      await logStatus({ entityType: "exception", entityId: ex.id, field: "status", from: ex.status, to: "open", actor, reason: `신고 다시 열기: ${note}` });
    }
  } else {
    // 예전 데이터라 예외 건이 없으면 새로 올린다
    const { data: made } = await db()
      .from("exceptions")
      .upsert({ kind: "safety", ref_type: "safety_report", ref_id: id, reason: `안전 신고(다시 검토): ${rep!.reason}`, dedupe_key: `safety:${id}`, created_at: t }, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (made?.[0]) await logStatus({ entityType: "exception", entityId: made[0].id, field: "status", to: "open", actor, reason: `신고 다시 열기: ${note}` });
  }
  return go(back, "m", "신고를 다시 열었어요. 예외 처리함에서 다시 조치해 주세요. 이미 건 계정 조치는 그대로예요");
}
