"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { PASSES, isMembership, type PassType } from "@/lib/constants";
import { usablePass } from "@/lib/billing";
import { fmtDay, fmtSlot } from "@/lib/format";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { roundCutoff } from "@/lib/policy";
import { loadTemplates, render } from "@/lib/templates";
import { areasLabel, sidoOf, slotsFor } from "@/lib/regions";
import { db } from "@/lib/supabase";

export async function submitApplication(form: FormData) {
  const me = await requireProfile();
  const roundId = String(form.get("round_id"));
  const areas = form.getAll("areas").map(String).filter((a) => Boolean(sidoOf(a)));
  const dates = form.getAll("dates").map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const nearOk = form.get("near_ok") === "on";
  const passRaw = String(form.get("pass"));
  const useOwned = passRaw === "owned";
  const pass = (useOwned ? "single" : passRaw) as PassType;
  const back = (m: string) => redirect(`/apply/${roundId}?e=${encodeURIComponent(m)}`);

  // 노쇼·신고로 이용이 제한된 계정은 신청할 수 없다 (SAF-02)
  const { applyBlock } = await import("@/lib/noshow");
  const blocked = await applyBlock(me.id, await now());
  if (blocked) back(blocked);

  const { data: round } = await db().from("rounds").select("id,title,apply_deadline,match_at,status,slots(id,region,sido,starts_at)").eq("id", roundId).maybeSingle();
  if (!round || round.status !== "open") back("모집이 끝난 일정이에요");
  if (new Date(round!.apply_deadline) <= (await now())) back("신청 마감 시간이 지났어요");
  if (!areas.length) back("동네를 하나 이상 골라주세요");
  if (!dates.length) back("갈 수 있는 날을 하나 이상 골라주세요");
  // 고른 동네 묶음 × 날짜에 열린 일정이 지원 대상이다. '가까운 동네'는 매칭 때 엔진이 따로 넓힌다
  const chosen = slotsFor(areas, dates, round!.slots ?? []);
  if (chosen.length === 0) back("고른 동네와 날짜에 열린 테이블이 없어요. 다시 골라주세요");
  if (!(pass in PASSES)) back("이용권을 골라 주세요");
  if (form.get("agree_refund") !== "on") back("환불 규정을 확인해 주세요");

  const { data: existing } = await db().from("applications").select("id,application_status").eq("user_id", me.id).eq("round_id", roundId).maybeSingle();
  if (existing && existing.application_status !== "CANCELED") redirect(`/applications/${existing.id}`);

  // 보유 이용권으로 신청하면 결제 없이 1회를 쓴다 (RET-03). 아니면 결제 대기 건을 만들고 결제 화면에서 승인한다
  const owned = useOwned ? await usablePass(me.id, await now()) : null;
  if (useOwned && !owned) back("쓸 수 있는 이용권이 없어요. 새 이용권을 골라 주세요");
  const ownedMembership = Boolean(owned && isMembership(owned.pass_type));
  if (owned && !ownedMembership) {
    const { data: took } = await db().from("passes").update({ remaining: owned.remaining - 1 }).eq("id", owned.id).eq("remaining", owned.remaining).select("id");
    if (!took?.length) back("이용권을 쓰는 중에 문제가 생겼어요. 다시 시도해 주세요");
  }
  const { data: payment } = await db()
    .from("payments")
    .insert(
      owned
        ? { user_id: me.id, amount: 0, pass_type: owned.pass_type, pass_id: owned.id, status: "PAID", provider: "pass", paid_at: (await now()).toISOString() }
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
    submitted_at: (await now()).toISOString(),
    areas,
    dates,
    near_ok: nearOk,
  };
  if (existing) await db().from("application_slots").delete().eq("application_id", existing.id);
  const { data: app, error } = existing
    ? await db().from("applications").update(fresh).eq("id", existing.id).select("id").single()
    : await db().from("applications").insert(fresh).select("id").single();
  if (error || !app) back("신청을 저장하지 못했어요. 다시 시도해 주세요");

  await db().from("application_slots").insert(chosen.map((slot_id) => ({ application_id: app!.id, slot_id })));
  await db().from("payments").update({ idempotency_key: `app:${app!.id}:${payment!.id}` }).eq("id", payment!.id);
  await logStatus({ entityType: "application", entityId: app!.id, field: "application_status", from: "DRAFT", to: "SUBMITTED", actor: `user:${me.id}`, reason: `${areasLabel(areas)} · ${dates.length}일 · 일정 ${chosen.length}개${nearOk ? " · 가까운 동네 허용" : ""}` });
  // 14장 알림은 운영자가 어드민(자동 메시지)에서 고친 문구로 보낸다
  const tpl = await loadTemplates();
  const chosenStarts = (round!.slots ?? []).filter((x) => chosen.includes(x.id)).map((x) => x.starts_at);
  const cancelBy = Math.min(new Date(round!.match_at).getTime(), roundCutoff(chosenStarts)?.getTime() ?? Infinity);
  const ap = render("applied", { round: round!.title, areas: areasLabel(areas), days: [...dates].sort().map((d) => fmtDay(`${d}T12:00:00+09:00`)).join("·"), cutoff: fmtSlot(new Date(cancelBy).toISOString()) }, tpl);
  await notify({
    userId: me.id,
    template: "applied",
    title: ap.title,
    body: ap.body,
    // 신청 내용(고른 동네·날짜·취소 방법)은 내 신청 화면에 있다. 결제 전이면 그 화면 맨 위 버튼이 결제로 이어진다
    link: `/applications/${app!.id}`,
    dedupeKey: `applied:${app!.id}:${payment!.id}`,
  });
  if (owned) {
    const used = ownedMembership ? "멤버십으로 신청(차감 없음)" : `보유 이용권 1회 사용 (남은 ${owned.remaining - 1}회)`;
    await logStatus({ entityType: "application", entityId: app!.id, field: "payment_status", from: "PENDING", to: "PAID", actor: `user:${me.id}`, reason: used });
    const pm = ownedMembership
      ? render("paid_membership", { match_at: fmtSlot(round!.match_at) }, tpl)
      : render("paid_pass", { remaining: String(owned.remaining - 1), match_at: fmtSlot(round!.match_at) }, tpl);
    await notify({ userId: me.id, template: "paid", title: pm.title, body: pm.body, link: `/applications/${app!.id}`, dedupeKey: `paid:${app!.id}:${payment!.id}` });
    // 시연: 같은 일정에 봇이 같이 신청한다 (lib/sim/bots.ts)
    const appId = app!.id;
    after(() => import("@/lib/sim/bots").then((b) => b.botsJoin(appId)).catch((e) => console.error("[bots] 같이 신청 실패", e)));
    redirect(`/applications/${app!.id}`);
  }
  // 결제 대기 안내 (14장): 결제 방법과 기한. 1시간 뒤에도 결제 전이면 한 번 더 알린다
  await notify({
    userId: me.id,
    template: "payment_pending",
    ...render("payment_pending", { deadline: fmtSlot(round!.apply_deadline) }, tpl),
    link: `/pay/${app!.id}`,
    dedupeKey: `payment_pending:${app!.id}:${payment!.id}`,
    // 시연 시계 기준(다른 예약 알림과 같은 시계로 tick이 보낸다)
    scheduledAt: new Date(Math.min((await now()).getTime() + 3600_000, new Date(round!.apply_deadline).getTime() - 600_000)),
  });
  redirect(`/pay/${app!.id}`);
}
