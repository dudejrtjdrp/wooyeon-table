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
import { now } from "@/lib/clock";
import { fromKstInput } from "@/lib/round-rules";
import { cancelScheduled } from "@/lib/scheduled";
import { checkScheduledEdit } from "@/lib/scheduled-rules";
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

/** 예약된 알림(아직 안 나감) 고치기: 제목·본문·보낼 시각. 사유와 함께 status_events에 이전 값을 남긴다 */
export async function editScheduled(form: FormData) {
  const id = String(form.get("id") ?? "");
  const back = `/admin/messages/scheduled/${id}`;
  const admin = await requireAdminWrite(back);
  const { data: n } = await db().from("notifications").select("id,title,body,scheduled_at,status,link,dedupe_key").eq("id", id).maybeSingle();
  if (!n) return go("/admin/messages?st=pending#log", "e", "알림을 찾지 못했어요");
  if (n.status !== "pending") return go(back, "e", "이미 나갔거나 취소된 알림이라 고칠 수 없어요");
  const tctx = await scheduledCtx(n.link);
  const startsAt = tctx?.starts ?? null;
  const chk = checkScheduledEdit({ title: String(form.get("title") ?? ""), body: String(form.get("body") ?? ""), at: fromKstInput(String(form.get("at") ?? "")), reason: String(form.get("reason") ?? ""), now: await now(), startsAt });
  if (!chk.ok) return go(back, "e", chk.message);
  if (chk.title === n.title && chk.body === n.body && Math.abs(Date.parse(chk.at) - Date.parse(n.scheduled_at)) < 60_000) return go(back, "m", "바뀐 것이 없어요");
  // 조건부: 그 사이 발송됐으면 고치지 않는다
  const { data: up } = await db().from("notifications").update({ title: chk.title, body: chk.body, scheduled_at: chk.at }).eq("id", id).eq("status", "pending").select("id");
  if (!up?.length) return go(back, "e", "그 사이 알림이 나갔어요. 고치지 못했어요");
  await logStatus({
    entityType: "notification", entityId: id, field: "scheduled_edit",
    from: JSON.stringify({ title: n.title, body: n.body, scheduled_at: n.scheduled_at }),
    to: JSON.stringify({ title: chk.title, body: chk.body, scheduled_at: chk.at, ...(tctx ? { ctx: tctx } : {}) }),
    actor: `admin:${admin.id}`, reason: `[운영자 예약 수정] ${chk.reason}`,
  });
  return go(back, "m", "예약을 고쳤어요. 보낼 때 이 문구 그대로 나가요");
}

/** 예약된 알림 취소. 사유를 받고, 지우지 않고 '취소'로 남긴다(상태값 적용 전 DB면 기록만 남기고 지운다) */
export async function cancelScheduledNotice(form: FormData) {
  const id = String(form.get("id") ?? "");
  const back = `/admin/messages/scheduled/${id}`;
  const admin = await requireAdminWrite(back);
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 4) return go(back, "e", "취소 사유를 4자 이상 적어 주세요. 변경 이력에 그대로 남아요");
  const { data: n } = await db().from("notifications").select("id,title,status,dedupe_key").eq("id", id).maybeSingle();
  if (!n || n.status !== "pending") return go(back, "e", "이미 나갔거나 취소된 알림이에요");
  const ok = await cancelScheduled(n, `admin:${admin.id}`, `[운영자 취소] ${reason}`);
  if (!ok) return go(back, "e", "그 사이 알림이 나갔어요. 취소하지 못했어요");
  // 상태값 적용 전 DB에선 행이 지워지니 목록으로 돌아간다
  const { data: still } = await db().from("notifications").select("id").eq("id", id).maybeSingle();
  return go(still ? back : "/admin/messages?st=pending#log", "m", `'${n.title}' 예약을 취소했어요. 보내지 않아요`);
}

/** 테이블로 가는 예약이면 고치는 지금의 테이블·식당·모임 시각. 보낼 시각은 모임 전이어야 하고, 뒤에 식당·시각이 바뀌면 고친 문구가 옛 내용이 된다 */
async function scheduledCtx(link: string | null): Promise<{ table: string; venue: string | null; starts: string | null } | null> {
  const m = /^\/tables\/([0-9a-f-]{36})$/.exec(link ?? "");
  if (!m) return null;
  const { data } = await db().from("dining_tables").select("venue_id,slots(starts_at)").eq("id", m[1]).maybeSingle();
  if (!data) return null;
  const d = data as unknown as { venue_id: string | null; slots: { starts_at: string } | null };
  return { table: m[1], venue: d.venue_id ?? null, starts: d.slots?.starts_at ?? null };
}
