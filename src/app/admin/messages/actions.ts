"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";
import { TEMPLATES, loadTemplates } from "@/lib/templates";

export async function saveTemplate(form: FormData) {
  const admin = await requireAdminWrite("/admin/messages");
  const key = String(form.get("key"));
  if (!(key in TEMPLATES)) return;
  const cur = await loadTemplates();
  // 이전 문구도 남긴다 (비어 있으면 기본 문구를 쓰던 것). 변경 이력에서 무엇이 바뀌었는지 보인다
  const prev = { title: cur[key]?.title ?? "", body: cur[key]?.body ?? "" };
  cur[key] = { title: String(form.get("title") ?? "").trim(), body: String(form.get("body") ?? "").trim() };
  if (prev.title === cur[key].title && prev.body === cur[key].body) redirect(`/admin/messages?m=${encodeURIComponent("바뀐 것이 없어요")}`);
  await db().from("settings").upsert({ key: "msg.templates", value: cur });
  await logStatus({ entityType: "setting", entityId: admin.id, field: `template:${key}`, from: JSON.stringify(prev), to: JSON.stringify(cur[key]), actor: `admin:${admin.id}`, reason: "자동 메시지 문구 수정" });
  revalidatePath("/admin/messages");
  const empty = !cur[key].title && !cur[key].body;
  redirect(`/admin/messages?m=${encodeURIComponent(empty ? `'${TEMPLATES[key as keyof typeof TEMPLATES].label}'을 기본 문구로 되돌렸어요` : `'${TEMPLATES[key as keyof typeof TEMPLATES].label}' 문구를 저장했어요. 다음 발송부터 이 문구로 나가요`)}`);
}
