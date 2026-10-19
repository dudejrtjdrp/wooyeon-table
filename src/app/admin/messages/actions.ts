"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { resendNotification } from "@/lib/delivery";
import { logStatus } from "@/lib/events";
import { adminBack } from "@/lib/members";
import { cleanNotice, isFailedNotice, noticeKey, noticeLink, noticeSendCheck, parseScope } from "@/lib/notice-rules";
import { notify } from "@/lib/notify";
import { db } from "@/lib/supabase";
import { TEMPLATES, loadTemplates, render } from "@/lib/templates";
import { loadNoticeTarget } from "./notice-data";

export async function saveTemplate(form: FormData) {
  const admin = await requireAdminWrite("/admin/messages/templates");
  const key = String(form.get("key"));
  if (!(key in TEMPLATES)) return;
  // 저장 뒤 같은 문구 칸으로 돌아온다 (묶음이 접혀 있으면 펼친다)
  const at = (k: "m" | "e", msg: string) => `/admin/messages/templates?${k}=${encodeURIComponent(msg)}#tpl-${key}`;
  const cur = await loadTemplates();
  // 이전 문구도 남긴다 (비어 있으면 기본 문구를 쓰던 것). 변경 이력에서 무엇이 바뀌었는지 보인다
  const prev = { title: cur[key]?.title ?? "", body: cur[key]?.body ?? "" };
  cur[key] = { title: String(form.get("title") ?? "").trim(), body: String(form.get("body") ?? "").trim() };
  if (prev.title === cur[key].title && prev.body === cur[key].body) redirect(at("m", "바뀐 것이 없어요"));
  await db().from("settings").upsert({ key: "msg.templates", value: cur });
  await logStatus({ entityType: "setting", entityId: admin.id, field: `template:${key}`, from: JSON.stringify(prev), to: JSON.stringify(cur[key]), actor: `admin:${admin.id}`, reason: "자동 메시지 문구 수정" });
  revalidatePath("/admin/messages/templates");
  const empty = !cur[key].title && !cur[key].body;
  redirect(at("m", empty ? `'${TEMPLATES[key as keyof typeof TEMPLATES].label}'을 기본 문구로 되돌렸어요` : `'${TEMPLATES[key as keyof typeof TEMPLATES].label}' 문구를 저장했어요. 다음 발송부터 이 문구로 나가요`));
}

/** 돌아갈 주소(어드민 안쪽)에 결과 안내를 붙인다. 앞서 붙어 있던 안내는 지운다 */
const go = (back: string, k: "m" | "e", msg: string): never => {
  const [pathQ, hash] = back.split("#");
  const [path, q] = pathQ.split("?");
  const p = new URLSearchParams(q ?? "");
  p.delete("m");
  p.delete("e");
  p.set(k, msg);
  revalidatePath("/admin/messages", "layout");
  redirect(`${path}?${p.toString()}${hash ? `#${hash}` : ""}`);
};

/** 발송 이력에서 실패한 알림 한 건 다시 보내기. 예외 처리함과 같은 재시도 로직(lib/delivery.ts)을 쓴다 */
export async function resendNotice(form: FormData) {
  const back = adminBack(form.get("back"), "/admin/messages");
  const admin = await requireAdminWrite(back);
  const id = String(form.get("id") ?? "");
  const { data: n } = await db().from("notifications").select("id,status,last_error,attempts").eq("id", id).maybeSingle();
  if (!n) return go(back, "e", "알림을 찾지 못했어요");
  if (!isFailedNotice(n)) return go(back, "m", "이미 나간 알림이에요");
  const { ok, skipped } = await resendNotification(id, admin.id);
  if (skipped) {
    await logStatus({ entityType: "notification", entityId: id, field: "resend", from: "failed", to: "보내지 않음", actor: `admin:${admin.id}`, reason: skipped });
    return go(back, "m", skipped);
  }
  await logStatus({ entityType: "notification", entityId: id, field: "resend", from: n.status === "failed" ? "failed" : "FAILED", to: ok ? "SENT" : "FAILED", actor: `admin:${admin.id}`, reason: `자동 메시지 화면에서 다시 보내기${n.last_error ? ` (이전 오류: ${n.last_error.slice(0, 80)})` : ""}` });
  revalidatePath("/admin/exceptions");
  revalidatePath("/admin");
  return ok ? go(back, "m", "다시 보냈어요") : go(back, "e", "또 보내지 못했어요. 받는 분 휴대폰 알림이 꺼져 있을 수 있어요. 알림함에는 들어가 있는지 확인하고, 급하면 직접 연락해 주세요");
}

/**
 * 운영자 공지 (회차 신청자·테이블·회원 한 명). 화면에서 본 받는 사람 수와 다시 센 수가 같을 때만 보낸다.
 * 같은 대상·같은 문구는 dedupeKey로 한 사람에게 한 번만 나간다. 보낸 기록은 대상의 상태 이력에 남긴다
 */
export async function sendAnnouncement(form: FormData) {
  const back = adminBack(form.get("back"), "/admin/messages");
  const admin = await requireAdminWrite(back);
  const scope = parseScope(form.get("scope"));
  const targetId = String(form.get("target") ?? "");
  if (!scope) return go(back, "e", "받을 대상을 골라 주세요");
  const text = cleanNotice(form.get("title"), form.get("body"));
  if (!text.ok) return go(back, "e", text.message);
  const target = await loadNoticeTarget(scope, targetId);
  if (!target.ok) return go(back, "e", target.message);
  const check = noticeSendCheck(form.get("expect"), target.userIds);
  if (!check.ok) return go(back, "e", check.message);

  const keys = new Map(target.userIds.map((u) => [u, noticeKey(scope, targetId, text.title, text.body, u)]));
  const { data: already } = await db().from("notifications").select("dedupe_key").in("dedupe_key", [...keys.values()]);
  const sentBefore = new Set((already ?? []).map((x) => x.dedupe_key));
  const todo = target.userIds.filter((u) => !sentBefore.has(keys.get(u)!));
  if (!todo.length) return go(back, "m", "같은 공지를 이미 모두에게 보냈어요. 다시 보내지 않았어요");

  const m = render("announcement", { headline: text.title, message: text.body }, await loadTemplates());
  const link = noticeLink(scope, targetId);
  // 한꺼번에 너무 많이 열지 않게 열 명씩
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map((u) => notify({ userId: u, template: "announcement", title: m.title, body: m.body, link, dedupeKey: keys.get(u) })));
  }
  const skipped = target.userIds.length - todo.length;
  await logStatus({
    entityType: scope === "round" ? "round" : scope === "table" ? "dining_table" : "user",
    entityId: targetId,
    field: "announcement",
    to: `${todo.length}명`,
    actor: `admin:${admin.id}`,
    reason: `${target.label}에게 공지: ${text.title} · ${text.body}${skipped ? ` (이미 받은 ${skipped}명 뺌)` : ""}`,
  });
  return go(back, "m", `${target.label} ${todo.length}명에게 공지를 보냈어요${skipped ? `. 이미 받은 ${skipped}명은 뺐어요` : ""}`);
}
