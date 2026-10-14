"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";
import { TEMPLATES, loadTemplates } from "@/lib/templates";

export async function saveTemplate(form: FormData) {
  const admin = await requireAdmin();
  const key = String(form.get("key"));
  if (!(key in TEMPLATES)) return;
  const cur = await loadTemplates();
  cur[key] = { title: String(form.get("title") ?? "").trim(), body: String(form.get("body") ?? "").trim() };
  await db().from("settings").upsert({ key: "msg.templates", value: cur });
  await logStatus({ entityType: "setting", entityId: admin.id, field: `template:${key}`, to: "updated", actor: `admin:${admin.id}`, reason: "자동 메시지 문구 수정" });
  revalidatePath("/admin/messages");
}
