"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseTemplateValue, parseWeightsValue, templateValue, weightsValue } from "@/lib/audit";
import { TEMPLATES, loadTemplates } from "@/lib/templates";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { currentWeightsValue } from "@/lib/audit-query";
import { db } from "@/lib/supabase";

/** 변경 이력의 매칭 기준 한 줄을 골라 그 값(바꾼 뒤 to / 바꾸기 전 from)으로 되돌린다. 되돌린 것도 이력에 남는다 */
export async function restoreWeights(form: FormData) {
  const back = String(form.get("back") ?? "/admin/audit");
  const safeBack = back.startsWith("/admin/audit") ? back : "/admin/audit";
  const me = await requireAdminWrite(safeBack);
  const go = (k: "m" | "e", msg: string) => redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
  const id = Number(form.get("event_id"));
  const which = form.get("which") === "from" ? "from" : "to";
  if (!Number.isInteger(id) || id <= 0) go("e", "되돌릴 이력을 찾지 못했어요");
  const { data: ev } = await db().from("status_events").select("id,field,from_value,to_value").eq("id", id).maybeSingle();
  if (!ev || ev.field !== "matching.weights") go("e", "매칭 기준 이력만 되돌릴 수 있어요");
  const v = parseWeightsValue(which === "from" ? ev!.from_value : ev!.to_value);
  if (!v) go("e", "이 이력에는 되돌릴 값이 남아 있지 않아요");
  const cur = await currentWeightsValue();
  const next = weightsValue(v!.weights, v!.min);
  if (cur === next) go("m", "지금 기준과 같아서 바꾸지 않았어요");
  await db().from("settings").upsert([{ key: "matching.weights", value: v!.weights }, { key: "matching.min_score", value: v!.min }]);
  await logStatus({ entityType: "setting", entityId: me.id, field: "matching.weights", from: cur, to: next, actor: `admin:${me.id}`, reason: `변경 이력에서 되돌림 (이력 #${id}의 ${which === "from" ? "바꾸기 전" : "바꾼 뒤"} 값)` });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/audit");
  go("m", "매칭 기준을 되돌렸어요. 다음 자동 매칭부터 이 기준으로 점수를 매겨요");
}

/** 변경 이력의 자동 메시지 문구 한 줄을 골라 그 문구(바꾼 뒤 / 바꾸기 전)로 되돌린다. 되돌린 것도 이력에 남는다 */
export async function restoreTemplate(form: FormData) {
  const back = String(form.get("back") ?? "/admin/audit");
  const safeBack = back.startsWith("/admin/audit") ? back : "/admin/audit";
  const me = await requireAdminWrite(safeBack);
  const go = (k: "m" | "e", msg: string) => redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
  const id = Number(form.get("event_id"));
  const which = form.get("which") === "from" ? "from" : "to";
  if (!Number.isInteger(id) || id <= 0) go("e", "되돌릴 이력을 찾지 못했어요");
  const { data: ev } = await db().from("status_events").select("id,field,from_value,to_value").eq("id", id).maybeSingle();
  const key = ev?.field?.startsWith("template:") ? ev.field.slice("template:".length) : "";
  if (!ev || !(key in TEMPLATES)) go("e", "자동 메시지 문구 이력만 되돌릴 수 있어요");
  const v = parseTemplateValue(which === "from" ? ev!.from_value : ev!.to_value);
  if (!v) go("e", "이 이력에는 되돌릴 문구가 남아 있지 않아요");
  const all = await loadTemplates();
  const cur = templateValue(all[key]);
  if (cur === templateValue(v!)) go("m", "지금 문구와 같아서 바꾸지 않았어요");
  all[key] = v!;
  await db().from("settings").upsert({ key: "msg.templates", value: all });
  await logStatus({ entityType: "setting", entityId: me.id, field: `template:${key}`, from: cur, to: templateValue(v!), actor: `admin:${me.id}`, reason: `변경 이력에서 되돌림 (이력 #${id}의 ${which === "from" ? "바꾸기 전" : "바꾼 뒤"} 문구)` });
  revalidatePath("/admin/messages");
  revalidatePath("/admin/audit");
  const label = TEMPLATES[key as keyof typeof TEMPLATES].label;
  go("m", !v!.title && !v!.body ? `'${label}'을 기본 문구로 되돌렸어요` : `'${label}' 문구를 되돌렸어요. 다음 발송부터 이 문구로 나가요`);
}
