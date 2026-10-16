"use server";

import { redirect } from "next/navigation";
import { dissolveTable, mergeInto, moveMember, removeMember, splitTable } from "@/lib/admin-ops";
import { requireAdmin } from "@/lib/auth";

export async function emergencyAction(form: FormData) {
  const me = await requireAdmin();
  const tableId = String(form.get("table_id"));
  const op = String(form.get("op"));
  const reason = String(form.get("reason") ?? "").trim();
  const back = (k: "m" | "e", msg: string) => redirect(`/admin/tables/${tableId}?${k}=${encodeURIComponent(msg)}#ops`);
  if (reason.length < 4) back("e", "사유를 4자 이상 적어 주세요. 변경 이력에 그대로 남아요");

  let r: { ok: boolean; message: string };
  if (op === "move") r = await moveMember(String(form.get("app_id")), String(form.get("target_id")), reason, me.id, form.get("allow_slot") === "on");
  else if (op === "remove") r = await removeMember(String(form.get("app_id")), reason, me.id, form.get("refund") === "on");
  else if (op === "merge") r = await mergeInto(tableId, String(form.get("target_id")), reason, me.id);
  else if (op === "split") r = await splitTable(tableId, form.getAll("app_ids").map(String), reason, me.id);
  else if (op === "dissolve") {
    if (form.get("confirm") !== "on") back("e", "해제 확인에 체크해 주세요");
    r = await dissolveTable(tableId, reason, me.id);
  } else r = { ok: false, message: "알 수 없는 작업이에요" };
  back(r.ok ? "m" : "e", r.message);
}

/** 식당 예약: 다시 시도하거나, 운영자가 직접 예약한 것으로 표시 */
export async function reservationAction(form: FormData) {
  const me = await requireAdmin();
  const tableId = String(form.get("table_id"));
  const { markReservedManually, resetAndRetry } = await import("@/lib/reservations");
  if (form.get("op") === "manual") await markReservedManually(tableId, String(form.get("ref") ?? "").trim(), me.id);
  else await resetAndRetry(tableId, me.id);
  redirect(`/admin/tables/${tableId}?m=${encodeURIComponent("예약 상태를 바꿨어요")}#reservation`);
}
