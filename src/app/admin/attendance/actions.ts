"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setAttendance } from "@/lib/admin-manual";
import type { AttendOp } from "@/lib/admin-manual-rules";
import { requireAdminWrite } from "@/lib/auth";

const OPS: AttendOp[] = ["checkin", "noshow", "revert"];

/** 참석 관리: 운영자가 체크인·노쇼·참석 예정으로 되돌리기. 판단은 lib/admin-manual-rules.ts attendanceChange */
export async function attendanceAction(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const appId = String(form.get("app_id") ?? "");
  const backTo = `/admin/attendance${roundId ? `?r=${roundId}` : ""}`;
  const me = await requireAdminWrite(backTo);
  const op = String(form.get("op")) as AttendOp;
  const note = String(form.get("note") ?? "").trim().slice(0, 100);
  const r = OPS.includes(op) ? await setAttendance(appId, op, note, me.id) : { ok: false, message: "알 수 없는 처리예요" };
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/exceptions");
  revalidatePath("/admin");
  redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}${r.ok ? "m" : "e"}=${encodeURIComponent(r.message)}#a-${appId}`);
}
