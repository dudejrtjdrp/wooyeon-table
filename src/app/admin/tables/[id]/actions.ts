"use server";

import { redirect } from "next/navigation";
import { checkReason, dissolveTable, mergeInto, moveMember, removeMember, splitTable } from "@/lib/admin-ops";
import { requireAdminWrite } from "@/lib/auth";

export async function emergencyAction(form: FormData) {
  const tableId = String(form.get("table_id"));
  const exId = String(form.get("ex") ?? "") || null;
  const keep = exId ? `ex=${exId}&` : "";
  const me = await requireAdminWrite(`/admin/tables/${tableId}${exId ? `?ex=${exId}` : ""}#ops`);
  const op = String(form.get("op"));
  const reason = String(form.get("reason") ?? "").trim();
  const back = (k: "m" | "e", msg: string) => redirect(`/admin/tables/${tableId}?${k === "e" ? keep : ""}${k}=${encodeURIComponent(msg)}#ops`);
  const bad = checkReason(reason);
  if (bad) back("e", bad.message);

  let r: { ok: boolean; message: string };
  if (op === "move") r = await moveMember(String(form.get("app_id")), String(form.get("target_id")), reason, me.id, form.get("allow_slot") === "on", exId);
  else if (op === "remove") r = await removeMember(String(form.get("app_id")), reason, me.id, form.get("refund") === "on", exId);
  else if (op === "merge") r = await mergeInto(tableId, String(form.get("target_id")), reason, me.id, exId);
  else if (op === "split") r = await splitTable(tableId, form.getAll("app_ids").map(String), reason, me.id, exId);
  else if (op === "dissolve") {
    if (form.get("confirm") !== "on") back("e", "해제 확인에 체크해 주세요");
    r = await dissolveTable(tableId, reason, me.id, exId);
  } else r = { ok: false, message: "알 수 없는 작업이에요" };
  back(r.ok ? "m" : "e", r.message);
}

/** 운영자가 테이블 식당을 바꾼다 (모임 시작 전, 같은 동네·일정에서 자리가 남은 식당). 사유 필수 */
export async function venueAction(form: FormData) {
  const tableId = String(form.get("table_id"));
  const me = await requireAdminWrite(`/admin/tables/${tableId}#venue`);
  const back = (k: "m" | "e", msg: string) => redirect(`/admin/tables/${tableId}?${k}=${encodeURIComponent(msg)}#venue`);
  const reason = String(form.get("reason") ?? "").trim();
  const bad = checkReason(reason);
  if (bad) back("e", bad.message);
  const venueId = String(form.get("venue_id") ?? "");
  if (!venueId) back("e", "바꿀 식당을 골라 주세요");
  const { swapVenue } = await import("@/lib/admin-manual");
  const r = await swapVenue(tableId, venueId, reason, me.id);
  back(r.ok ? "m" : "e", r.message);
}

/** 식당 예약: 다시 시도하거나, 운영자가 직접 예약한 것으로 표시 */
export async function reservationAction(form: FormData) {
  const tableId = String(form.get("table_id"));
  const me = await requireAdminWrite(`/admin/tables/${tableId}#reservation`);
  const { markReservedManually, resetAndRetry } = await import("@/lib/reservations");
  const manual = form.get("op") === "manual";
  if (manual) await markReservedManually(tableId, String(form.get("ref") ?? "").trim(), me.id);
  else await resetAndRetry(tableId, me.id);
  const { db } = await import("@/lib/supabase");
  const { data: r } = await db().from("reservations").select("status,last_error").eq("table_id", tableId).maybeSingle();
  const ok = r?.status === "CONFIRMED";
  const msg = ok ? (manual ? "직접 예약한 것으로 표시했어요" : "예약이 확정됐어요") : `아직 예약되지 않았어요${r?.last_error ? `: ${r.last_error}` : ""}`;
  redirect(`/admin/tables/${tableId}?${ok ? "m" : "e"}=${encodeURIComponent(msg)}#reservation`);
}
