"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { cleanNote } from "@/lib/cancel-rules";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { fmtDay } from "@/lib/format";
import { notify } from "@/lib/notify";
import { type PassRow, parseExtendDays, parseGrantCount, passStamp, planExtend, planGrant } from "@/lib/pass-grant-rules";
import { db } from "@/lib/supabase";
import { loadTemplates, render } from "@/lib/templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 폼의 회원 id. 모양이 틀리면 회원 찾기로 돌려보낸다 */
const memberId = (form: FormData) => {
  const id = String(form.get("user_id") ?? "");
  if (!UUID.test(id)) redirect(`/admin/members?e=${encodeURIComponent("회원을 찾지 못했어요")}`);
  return id;
};

const go = (userId: string, k: "m" | "e", msg: string): never => {
  revalidatePath(`/admin/members/${userId}`);
  redirect(`/admin/members/${userId}?${k}=${encodeURIComponent(msg)}#passes`);
};

async function load(userId: string) {
  const { data: u } = await db().from("users").select("id,role,deleted_at").eq("id", userId).maybeSingle();
  const { data } = await db().from("passes").select("id,pass_type,remaining,total_count,expires_at").eq("user_id", userId);
  return { user: u, passes: (data ?? []) as PassRow[] };
}

/**
 * 보유 이용권 횟수 더하기 (보상·문의 처리). 1~5회, 사유 필수.
 * 돈으로 산 이용권에는 얹지 않고 운영자가 준 이용권에 더하거나 새로 만든다(pass-grant-rules.ts 이유 참고)
 */
export async function grantPass(form: FormData) {
  const userId = memberId(form);
  const admin = await requireAdminWrite(`/admin/members/${userId}`);
  const n = parseGrantCount(form.get("count"));
  const note = cleanNote(form.get("note"));
  if (!n) return go(userId, "e", "더할 횟수는 1~5회 중에서 골라 주세요");
  if (!note) return go(userId, "e", "사유를 4자 이상 적어 주세요. 이용권 이력에 그대로 남아요");
  const { user, passes } = await load(userId);
  if (!user || user.role !== "user") return go(userId, "e", "회원을 찾지 못했어요");
  if (user.deleted_at) return go(userId, "e", "탈퇴한 회원에게는 이용권을 줄 수 없어요");
  if (String(form.get("stamp") ?? "") !== passStamp(passes)) return go(userId, "e", "그 사이 이용권이 바뀌었어요. 화면에서 지금 상태를 보고 다시 해 주세요");

  const t = await now();
  const { data: pays } = passes.length ? await db().from("payments").select("pass_id,amount").eq("user_id", userId).gt("amount", 0).not("pass_id", "is", null) : { data: [] };
  const plan = planGrant(passes, new Set((pays ?? []).map((p) => p.pass_id as string)), n, t);
  const actor = `admin:${admin.id}`;
  let passId: string;
  if (plan.kind === "add") {
    // 화면을 연 뒤 남은 횟수가 그대로일 때만 더한다 (동시에 쓰거나 두 번 눌러도 한 번만)
    const { data: done } = await db()
      .from("passes")
      .update({ remaining: plan.to.remaining, total_count: plan.to.total, expires_at: plan.to.expiresAt })
      .eq("id", plan.passId)
      .eq("remaining", plan.from.remaining)
      .eq("total_count", plan.from.total)
      .select("id");
    if (!done?.length) return go(userId, "e", "그 사이 이용권이 바뀌었어요. 다시 해 주세요");
    passId = plan.passId;
    await logStatus({ entityType: "pass", entityId: passId, field: "remaining", from: String(plan.from.remaining), to: String(plan.to.remaining), actor, reason: `운영자 지급 ${n}회: ${note}` });
    if (plan.to.expiresAt !== plan.from.expiresAt && plan.to.expiresAt) {
      await logStatus({ entityType: "pass", entityId: passId, field: "expires_at", from: plan.from.expiresAt, to: plan.to.expiresAt, actor, reason: `지급한 횟수를 쓸 수 있게 기한 맞춤: ${note}` });
    }
  } else {
    // 새 이용권은 조건부로 고칠 줄이 없어, 화면을 연 때의 이용권 상태(stamp)로 한 번만 잡는 표시를 먼저 남긴다.
    // settings.key가 기본 키라 같은 화면에서 두 번 눌러도 두 번째는 여기서 막힌다(마이그레이션 없이)
    const { data: claim } = await db().from("settings").upsert({ key: `grant-lock:${userId}:${passStamp(passes)}`, value: { by: admin.id, at: t.toISOString() } }, { onConflict: "key", ignoreDuplicates: true }).select("key");
    if (!claim?.length) return go(userId, "e", "이미 처리된 요청이에요. 화면을 새로 고쳐 확인해 주세요");
    const { data: created, error } = await db()
      .from("passes")
      .insert({ user_id: userId, pass_type: "single", total_count: plan.to.total, remaining: plan.to.remaining, expires_at: plan.to.expiresAt })
      .select("id")
      .single();
    if (error || !created) return go(userId, "e", "이용권을 만들지 못했어요. 잠시 뒤 다시 해 주세요");
    passId = created.id;
    await logStatus({ entityType: "pass", entityId: passId, field: "remaining", from: null, to: String(plan.to.remaining), actor, reason: `운영자 지급 ${n}회(새 이용권): ${note}` });
  }

  const until = plan.to.expiresAt ? fmtDay(plan.to.expiresAt) : "기한 없이";
  const m = render("pass_granted", { count: String(n), until }, await loadTemplates());
  // 기한 없는 이용권이면 "기한 없이까지"가 되지 않게 본문을 따로 쓴다
  if (!plan.to.expiresAt) m.body = "기한 없이 다음 일정에 쓸 수 있어요";
  await notify({ userId, template: "pass_granted", title: m.title, body: m.body, link: "/me", dedupeKey: `pass_grant:${passId}:${plan.to.total}` });
  revalidatePath("/admin/payments");
  return go(userId, "m", `이용권 ${n}회를 더했어요 (${plan.to.expiresAt ? `${until}까지` : "기한 없음"}). 회원에게 알림을 보냈어요`);
}

/** 멤버십 기간 늘리기 (보상·문의 처리). 1~30일, 사유 필수. 멤버십이 없으면 새로 만들지 않는다 */
export async function extendMembership(form: FormData) {
  const userId = memberId(form);
  const admin = await requireAdminWrite(`/admin/members/${userId}`);
  const days = parseExtendDays(form.get("days"));
  const note = cleanNote(form.get("note"));
  if (!days) return go(userId, "e", "늘릴 기간은 1~30일 사이로 적어 주세요");
  if (!note) return go(userId, "e", "사유를 4자 이상 적어 주세요. 이용권 이력에 그대로 남아요");
  const { user, passes } = await load(userId);
  if (!user || user.role !== "user") return go(userId, "e", "회원을 찾지 못했어요");
  if (String(form.get("stamp") ?? "") !== passStamp(passes)) return go(userId, "e", "그 사이 이용권이 바뀌었어요. 화면에서 지금 상태를 보고 다시 해 주세요");
  const plan = planExtend(passes, days, await now());
  if (!plan.ok) return go(userId, "e", plan.message);

  const { data: done } = await db().from("passes").update({ expires_at: plan.to }).eq("id", plan.passId).eq("expires_at", plan.from).select("id");
  if (!done?.length) return go(userId, "e", "그 사이 멤버십 기한이 바뀌었어요. 다시 해 주세요");
  await logStatus({ entityType: "pass", entityId: plan.passId, field: "expires_at", from: plan.from, to: plan.to, actor: `admin:${admin.id}`, reason: `운영자 연장 ${days}일${plan.fromToday ? "(기한이 지나 오늘부터)" : ""}: ${note}` });
  const until = fmtDay(plan.to);
  const m = render("membership_granted", { extra_days: String(days), until }, await loadTemplates());
  await notify({ userId, template: "membership_granted", title: m.title, body: m.body, link: "/me", dedupeKey: `membership_grant:${plan.passId}:${Date.parse(plan.to)}` });
  return go(userId, "m", `멤버십 기간을 ${days}일 늘렸어요 (${until}까지). 회원에게 알림을 보냈어요`);
}
