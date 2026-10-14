"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { PASSES, type PassType } from "@/lib/constants";
import { usablePass } from "@/lib/billing";
import { fmtDateTime } from "@/lib/format";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { db } from "@/lib/supabase";

export async function submitApplication(form: FormData) {
  const me = await requireProfile();
  const roundId = String(form.get("round_id"));
  const slotIds = form.getAll("slot_ids").map(String);
  const passRaw = String(form.get("pass"));
  const useOwned = passRaw === "owned";
  const pass = (useOwned ? "single" : passRaw) as PassType;
  const back = (m: string) => redirect(`/apply/${roundId}?e=${encodeURIComponent(m)}`);

  const { data: round } = await db().from("rounds").select("id,title,apply_deadline,match_at,status,slots(id)").eq("id", roundId).maybeSingle();
  if (!round || round.status !== "open") back("모집이 끝난 일정이에요");
  if (new Date(round!.apply_deadline) <= (await now())) back("신청 마감 시간이 지났어요");
  const valid = new Set((round!.slots ?? []).map((s: { id: string }) => s.id));
  const chosen = slotIds.filter((id) => valid.has(id));
  if (chosen.length === 0) back("참가할 수 있는 날짜와 동네를 하나 이상 골라 주세요");
  if (!(pass in PASSES)) back("이용권을 골라 주세요");
  if (form.get("agree_refund") !== "on") back("환불 규정을 확인해 주세요");

  const { data: existing } = await db().from("applications").select("id,application_status").eq("user_id", me.id).eq("round_id", roundId).maybeSingle();
  if (existing && existing.application_status !== "CANCELED") redirect(`/applications/${existing.id}`);

  // 보유 이용권으로 신청하면 결제 없이 1회를 쓴다 (RET-03). 아니면 결제 대기 건을 만들고 결제 화면에서 승인한다
  const owned = useOwned ? await usablePass(me.id, await now()) : null;
  if (useOwned && !owned) back("쓸 수 있는 이용권이 없어요. 새 이용권을 골라 주세요");
  if (owned) {
    const { data: took } = await db().from("passes").update({ remaining: owned.remaining - 1 }).eq("id", owned.id).eq("remaining", owned.remaining).select("id");
    if (!took?.length) back("이용권을 쓰는 중에 문제가 생겼어요. 다시 시도해 주세요");
  }
  const { data: payment } = await db()
    .from("payments")
    .insert(
      owned
        ? { user_id: me.id, amount: 0, pass_type: owned.pass_type, pass_id: owned.id, status: "PAID", provider: "pass", paid_at: new Date().toISOString() }
        : { user_id: me.id, amount: PASSES[pass].amount, pass_type: pass, status: "PENDING", provider: "mock" },
    )
    .select("id")
    .single();

  // 취소했던 차수에 다시 신청하면 같은 줄을 되살린다 (한 사람이 한 차수에 신청 하나)
  const fresh = {
    user_id: me.id,
    round_id: roundId,
    payment_id: payment!.id,
    application_status: "SUBMITTED",
    payment_status: owned ? "PAID" : "PENDING",
    match_status: "WAITING",
    resolution: null,
    match_reason: null,
    submitted_at: new Date().toISOString(),
  };
  if (existing) await db().from("application_slots").delete().eq("application_id", existing.id);
  const { data: app, error } = existing
    ? await db().from("applications").update(fresh).eq("id", existing.id).select("id").single()
    : await db().from("applications").insert(fresh).select("id").single();
  if (error || !app) back("신청을 저장하지 못했어요. 다시 시도해 주세요");

  await db().from("application_slots").insert(chosen.map((slot_id) => ({ application_id: app!.id, slot_id })));
  await db().from("payments").update({ idempotency_key: `app:${app!.id}:${payment!.id}` }).eq("id", payment!.id);
  await logStatus({ entityType: "application", entityId: app!.id, field: "application_status", from: "DRAFT", to: "SUBMITTED", actor: `user:${me.id}`, reason: `${chosen.length}개 일정 선택` });
  await notify({
    userId: me.id,
    template: "applied",
    title: "신청이 접수됐어요",
    body: `${round!.title} 신청을 받았어요. 결제를 마치면 매칭 대상이 돼요.`,
    link: `/pay/${app!.id}`,
    dedupeKey: `applied:${app!.id}:${payment!.id}`,
  });
  if (owned) {
    await logStatus({ entityType: "application", entityId: app!.id, field: "payment_status", from: "PENDING", to: "PAID", actor: `user:${me.id}`, reason: `보유 이용권 1회 사용 (남은 ${owned.remaining - 1}회)` });
    await notify({ userId: me.id, template: "paid", title: "이용권으로 신청했어요", body: `이용권 1회를 썼어요. 남은 횟수는 ${owned.remaining - 1}회예요. ${fmtDateTime(round!.match_at)}에 자동으로 테이블을 꾸려서 알려드릴게요.`, link: `/applications/${app!.id}`, dedupeKey: `paid:${app!.id}:${payment!.id}` });
    redirect(`/applications/${app!.id}`);
  }
  // 결제 대기 안내 (14장): 결제 방법과 기한. 1시간 뒤에도 결제 전이면 한 번 더 알린다
  await notify({
    userId: me.id,
    template: "payment_pending",
    title: "결제를 마쳐야 매칭에 들어가요",
    body: `${fmtDateTime(round!.apply_deadline)}까지 결제해 주세요. 카드, 카카오페이, 네이버페이, 토스페이로 낼 수 있어요.`,
    link: `/pay/${app!.id}`,
    dedupeKey: `payment_pending:${app!.id}:${payment!.id}`,
    scheduledAt: new Date(Math.min(Date.now() + 3600_000, new Date(round!.apply_deadline).getTime() - 600_000)),
  });
  redirect(`/pay/${app!.id}`);
}
