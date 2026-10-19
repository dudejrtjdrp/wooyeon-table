"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { releaseUse } from "@/lib/billing";
import { now } from "@/lib/clock";
import { OPEN_REGIONS, REGIONS } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { roundCutoff } from "@/lib/policy";
import { canCancelRound, canDeleteSlot, roundCancelTargets, checkMaxTables, checkRoundEdit, checkSlotAdd, fromKstInput } from "@/lib/round-rules";
import { loadTemplates, render } from "@/lib/templates";
import { sidoOf } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { logStatus } from "@/lib/events";
import { fmtSlot } from "@/lib/format";

/** 검증에 걸리면 고친 값을 그대로 돌려준다(f=JSON). 다시 처음부터 채우지 않게 */
function failRound(form: FormData, msg: string): never {
  const keep = {
    title: String(form.get("title") ?? ""),
    deadline: String(form.get("deadline") ?? ""),
    match_at: String(form.get("match_at") ?? ""),
    dates: form.getAll("dates").map(String),
    time: String(form.get("time") ?? ""),
    duration: String(form.get("duration") ?? ""),
    regions: form.getAll("regions").map(String),
    max_tables: String(form.get("max_tables") ?? ""),
  };
  redirect(`/admin/rounds?e=${encodeURIComponent(msg)}&f=${encodeURIComponent(JSON.stringify(keep))}#new-round`);
}

export async function createRound(form: FormData) {
  const me = await requireAdminWrite("/admin/rounds");
  const title = String(form.get("title") ?? "").trim();
  const dates0 = form.getAll("dates").map(String).filter(Boolean);
  const time0 = String(form.get("time") ?? "19:30");
  // 비우면 운영 규칙대로 '모임 주 화요일 24:00'에 신청·환불·매칭을 함께 마감한다 (docs/prd/08-qna.md)
  const auto = roundCutoff(dates0.map((d) => `${d}T${time0}:00+09:00`));
  const fmtLocal = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16);
  const deadline = String(form.get("deadline") ?? "") || (auto ? fmtLocal(auto) : "");
  const matchAtRaw = String(form.get("match_at") ?? "") || deadline;
  const minutes = Math.max(60, Number(form.get("duration") ?? 150));
  const dates = form.getAll("dates").map(String).filter(Boolean);
  const time = String(form.get("time") ?? "19:30");
  const regions = form.getAll("regions").map(String).filter((r) => REGIONS.includes(r));
  const maxTables = Number(form.get("max_tables") ?? 4);
  if (!title || !dates.length || !regions.length) failRound(form, `${[!title && "이름", !dates.length && "날짜", !regions.length && "동네"].filter(Boolean).join(", ")}을(를) 채워 주세요`);
  if (!deadline) failRound(form, "신청 마감을 정하지 못했어요. 날짜를 다시 확인하거나 마감 시각을 직접 넣어 주세요");
  if (matchAtRaw < deadline) failRound(form, "자동 매칭은 신청 마감과 같거나 뒤여야 해요");
  if (!(maxTables >= 1)) failRound(form, "일정당 최대 테이블 수는 1 이상이어야 해요");

  const kst = (d: string, t: string) => new Date(`${d}T${t}:00+09:00`).toISOString();
  const { data: round } = await db()
    .from("rounds")
    .insert({ title, apply_deadline: kst(deadline.slice(0, 10), deadline.slice(11, 16)), match_at: kst(matchAtRaw.slice(0, 10), matchAtRaw.slice(11, 16)) })
    .select("id")
    .single();
  const rows = dates.flatMap((d) =>
    regions.map((region) => {
      const start = kst(d, time);
      return { round_id: round!.id, region, sido: sidoOf(region) ?? null, starts_at: start, ends_at: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(), max_tables: maxTables };
    }),
  );
  const { data: slots } = await db().from("slots").insert(rows).select("id,region");
  const { data: venues } = await db().from("venues").select("id,region").eq("active", true);
  const vs = (slots ?? []).flatMap((s) => (venues ?? []).filter((v) => v.region === s.region).map((v) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (vs.length) await db().from("venue_slots").insert(vs);
  // 누가 언제 어떤 조건으로 만들었는지 남긴다 (처리 이력)
  await logStatus({
    entityType: "round", entityId: round!.id, field: "status", from: null, to: "open", actor: `admin:${me.id}`,
    reason: `회차 만들기: ${title} · 신청 마감 ${deadline.replace("T", " ")} · 자동 매칭 ${matchAtRaw.replace("T", " ")} · 일정 ${rows.length}개(${regions.join("·")}) · 일정당 최대 ${maxTables}테이블`,
  });
  // 이 동네가 열리길 기다리던 사람에게 알린다 (지역 수요 조사)
  const { data: waiting } = await db().from("region_demands").select("id,user_id,area").in("area", regions).is("notified_at", null);
  for (const w of waiting ?? []) {
    await notify({ userId: w.user_id, template: "region_open", title: `${w.area}에 테이블이 열렸어요`, body: `'${title}' 신청을 받아요`, link: `/apply/${round!.id}`, dedupeKey: `region_open:${w.id}:${round!.id}` });
    await db().from("region_demands").update({ notified_at: new Date().toISOString() }).eq("id", w.id);
  }
  revalidatePath("/admin/rounds");
  const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(kst(matchAtRaw.slice(0, 10), matchAtRaw.slice(11, 16))));
  redirect(`/admin/rounds?r=${round!.id}&m=${encodeURIComponent(`'${title}' 회차를 만들었어요. 일정 ${rows.length}개, 식당 재고 ${vs.length}칸이 잡혔고 ${when}에 매칭이 자동으로 돌아요. 결과는 자동 매칭 모니터에서 볼 수 있어요`)}`);
}


/** 식당 재고: 일정별로 이 식당이 받을 수 있는 테이블 수 */
export async function setCapacity(form: FormData) {
  const me = await requireAdminWrite("/admin/rounds");
  const venueId = String(form.get("venue_id"));
  const slotId = String(form.get("slot_id"));
  const n = Math.max(0, Math.min(20, Number(form.get("tables") ?? 0)));
  const [{ data: prev }, { data: v }, { data: sl }] = await Promise.all([
    db().from("venue_slots").select("tables_available").eq("venue_id", venueId).eq("slot_id", slotId).maybeSingle(),
    db().from("venues").select("name").eq("id", venueId).maybeSingle(),
    db().from("slots").select("starts_at,region").eq("id", slotId).maybeSingle(),
  ]);
  await db().from("venue_slots").upsert({ venue_id: venueId, slot_id: slotId, tables_available: n });
  // 식당 재고도 누가·언제·얼마로 바꿨는지 남긴다 (배정 결과가 달라지는 변경이라서)
  if ((prev?.tables_available ?? 0) !== n)
    await logStatus({ entityType: "venue", entityId: venueId, field: "tables_available", from: String(prev?.tables_available ?? 0), to: String(n), actor: `admin:${me.id}`, reason: `식당 재고: ${v?.name ?? "식당"}${sl ? ` · ${fmtSlot(sl.starts_at)} ${sl.region}` : ""} 받을 수 있는 테이블 ${prev?.tables_available ?? 0} → ${n}` });
  revalidatePath("/admin/rounds");
  const r = String(form.get("r") ?? "");
  redirect(`/admin/rounds?${r ? `r=${r}&` : ""}m=${encodeURIComponent(`받을 수 있는 테이블을 ${n}개로 바꿨어요. 다음 식당 배정부터 반영돼요`)}`);
}

// ─────────────────────────────────────────────
// 모집 중인 회차 고치기·취소, 일정 더하기·지우기, 일정별 최대 테이블 수
// 판단은 lib/round-rules.ts 순수 함수에서 하고, 여기서는 읽고 쓰고 기록만 한다
// ─────────────────────────────────────────────

const back = (roundId: string, q: { m?: string; e?: string }, hash = "edit"): never =>
  redirect(`/admin/rounds?r=${roundId}${q.m ? `&m=${encodeURIComponent(q.m)}` : ""}${q.e ? `&e=${encodeURIComponent(q.e)}` : ""}#${hash}`);

async function loadRound(roundId: string) {
  const { data } = await db().from("rounds").select("id,title,status,apply_deadline,match_at,slots(id,region,starts_at,ends_at,max_tables)").eq("id", roundId).maybeSingle();
  if (!data) redirect(`/admin/rounds?e=${encodeURIComponent("회차를 찾지 못했어요")}`);
  return data;
}

/** 회차 이름·신청 마감·자동 매칭 시각 고치기. 화면에서 '이렇게 바뀌어요'를 본 뒤에만 이 액션이 불린다 */
export async function updateRound(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const me = await requireAdminWrite(`/admin/rounds?r=${roundId}`);
  const round = await loadRound(roundId);
  const deadline = fromKstInput(String(form.get("deadline") ?? ""));
  const matchAt = fromKstInput(String(form.get("match_at") ?? ""));
  const before = { title: round.title, deadline: round.apply_deadline, matchAt: round.match_at };
  const after = { title: String(form.get("title") ?? ""), deadline: deadline ?? "", matchAt: matchAt ?? "" };
  const chk = checkRoundEdit({ status: round.status, before, after, slotStarts: round.slots.map((x) => x.starts_at), now: await now() });
  if (chk.errors.length) back(roundId, { e: chk.errors[0] });

  const patch: Partial<Record<"title" | "apply_deadline" | "match_at", string>> = {};
  for (const c of chk.changes) patch[c.field] = c.to;
  // 조건부 업데이트: 그 사이 매칭이 시작됐으면 바꾸지 않는다
  const { data: up } = await db().from("rounds").update(patch).eq("id", roundId).eq("status", "open").select("id");
  if (!up?.length) back(roundId, { e: "그 사이 매칭이 시작돼 고치지 못했어요" });
  for (const c of chk.changes)
    await logStatus({ entityType: "round", entityId: roundId, field: c.field, from: c.from, to: c.to, actor: `admin:${me.id}`, reason: `회차 고치기: ${c.label} ${c.fromText} → ${c.toText}` });

  const { data: apps } = await db().from("applications").select("id,user_id,payment_status").eq("round_id", roundId).eq("application_status", "SUBMITTED");
  const tpl = await loadTemplates();
  const title = patch.title ?? round.title;
  // 신청 마감이 바뀌면, 아직 결제 전인 사람에게 예약해 둔 결제 안내도 새 마감에 맞춘다
  if (patch.apply_deadline) {
    const m = render("payment_pending", { deadline: fmtSlot(patch.apply_deadline) }, tpl);
    const latest = new Date(new Date(patch.apply_deadline).getTime() - 600_000).toISOString();
    for (const a of (apps ?? []).filter((x) => x.payment_status === "PENDING")) {
      await db().from("notifications").update({ title: m.title, body: m.body }).eq("status", "pending").like("dedupe_key", `payment_pending:${a.id}:%`);
      await db().from("notifications").update({ scheduled_at: latest }).eq("status", "pending").like("dedupe_key", `payment_pending:${a.id}:%`).gt("scheduled_at", latest);
    }
  }
  // 결과 안내 시각이 바뀌면 결제를 마친 신청자에게 알린다 (결제 완료 알림에 옛 시각이 적혀 있어서)
  let told = 0;
  if (patch.match_at) {
    const m = render("round_changed", { round: title, match_at: fmtSlot(patch.match_at) }, tpl);
    for (const a of (apps ?? []).filter((x) => x.payment_status === "PAID")) {
      await notify({ userId: a.user_id, template: "round_changed", title: m.title, body: m.body, link: `/applications/${a.id}`, dedupeKey: `round_changed:${a.id}:${patch.match_at}` });
      told++;
    }
  }
  revalidatePath("/admin/rounds");
  const what = chk.changes.map((c) => c.label).join("·");
  back(roundId, { m: `${what}을(를) 바꿨어요. 이전 값은 변경 이력에 남았어요${told ? `. 결제를 마친 ${told}명에게 바뀐 결과 안내 시각을 알렸어요` : ""}` });
}

const ROUND_CANCELED_REASON = "운영 사정으로 이번 회차가 취소됐어요. 결제하셨다면 그대로 돌려드려요.";

/** 매칭 전 회차 취소: 신청을 모두 취소하고, 결제한 사람은 자동 환불(멤버십·보유 이용권은 쓴 횟수 반환), 신청자 전원에게 알린다 */
export async function cancelRound(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const me = await requireAdminWrite(`/admin/rounds?r=${roundId}`);
  const actor = `admin:${me.id}`;
  const note = String(form.get("reason") ?? "").trim().slice(0, 100);
  const round = await loadRound(roundId);
  const { data: run } = await db().from("match_runs").select("id").eq("round_id", roundId).maybeSingle();
  const { data: ev } = await db().from("status_events").select("reason").eq("entity_type", "round").eq("entity_id", roundId).eq("field", "canceled").eq("to_value", "true").limit(1);
  const ok = canCancelRound({ status: round.status, hasMatchRun: !!run, matchAt: round.match_at, now: await now(), canceled: !!ev?.length });
  if (!ok.ok) return back(roundId, { e: ok.reason }, "cancel");
  // 이어서 정리할 때는 처음 취소한 사유를 그대로 쓴다
  const why = ok.resume ? (ev?.[0]?.reason ?? "회차 취소") : `회차 취소${note ? `: ${note}` : ""}`;

  if (!ok.resume) {
    // 먼저 회차를 닫아 새 신청과 자동 매칭을 막는다 (DB 상태값에 '취소'가 없어 'closed' + 변경 이력의 canceled로 구분한다, docs/01-state-flow.md)
    // 신청 정리 중에 끊기면 같은 버튼('남은 신청 정리')으로 이어서 한다. 신청마다 조건부 업데이트라 두 번 돌려도 한 번만 처리된다
    const { data: up } = await db().from("rounds").update({ status: "closed" }).eq("id", roundId).eq("status", "open").select("id");
    if (!up?.length) return back(roundId, { e: "그 사이 매칭이 시작돼 취소하지 못했어요" }, "cancel");
    await logStatus({ entityType: "round", entityId: roundId, field: "status", from: "open", to: "closed", actor, reason: why });
    await logStatus({ entityType: "round", entityId: roundId, field: "canceled", from: "false", to: "true", actor, reason: why });
  }

  // 처리 대상: 아직 취소되지 않은 신청 + (이어서 정리할 때) 취소는 됐는데 환불 전에 끊겨 결제가 PAID로 남은 신청
  // releaseUse는 결제가 PAID일 때만 움직이고 끝나면 PAID를 벗어나므로 두 번 불려도 한 번만 돌려준다
  const { data: apps } = await db().from("applications").select("id,user_id,application_status,payment_status,match_status").eq("round_id", roundId).or("application_status.neq.CANCELED,payment_status.eq.PAID");
  const tpl = await loadTemplates();
  const m = render("round_canceled", { round: round.title }, tpl);
  let told = 0;
  for (const a of roundCancelTargets(apps ?? [], !!ok.resume)) {
    // 참가자 화면에 '본인이 취소한 것'처럼 보이지 않게 이유 한 줄을 남긴다 (match_reason은 신청 화면 본문)
    if (a.needsCancel) {
      const { data: done } = await db().from("applications").update({ application_status: "CANCELED", match_status: "NO_MATCH", match_reason: ROUND_CANCELED_REASON }).eq("id", a.id).neq("application_status", "CANCELED").select("id");
      if (!done?.length) continue;
      await logStatus({ entityType: "application", entityId: a.id, field: "application_status", from: a.application_status, to: "CANCELED", actor, reason: why });
      if (a.match_status !== "NO_MATCH") await logStatus({ entityType: "application", entityId: a.id, field: "match_status", from: a.match_status, to: "NO_MATCH", actor, reason: why });
    }
    await db().from("notifications").delete().eq("status", "pending").like("dedupe_key", `payment_pending:${a.id}:%`);
    // 1회권은 refundPayment로 원결제수단 환불. 결제사에서 안 되면 10분 간격 재시도 → 세 번째 실패에 예외 처리함으로 (lib/payments.ts)
    await releaseUse(a.id, actor, why);
    if (a.application_status === "SUBMITTED" || ok.resume) {
      await notify({ userId: a.user_id, template: "round_canceled", title: m.title, body: m.body, link: `/applications/${a.id}`, dedupeKey: `round_canceled:${a.id}` });
      told++;
    }
  }
  const ids = (apps ?? []).map((a) => a.id);
  const { data: after } = ids.length ? await db().from("applications").select("payment_status").in("id", ids) : { data: [] as { payment_status: string }[] };
  const refunded = (after ?? []).filter((a) => a.payment_status === "REFUNDED").length;
  const failed = (after ?? []).filter((a) => a.payment_status === "REFUND_FAILED").length;
  revalidatePath("/admin/rounds");
  back(roundId, {
    m: `'${round.title}' 회차를 ${ok.resume ? "마저 정리했어요" : "취소했어요"}. 신청자 ${told}명에게 알렸고 ${refunded}건을 돌려드렸어요${failed ? `. 결제사에서 바로 안 된 ${failed}건은 10분 뒤 자동으로 다시 시도하고, 세 번 안 되면 예외 처리함에 올라가요` : ""}`,
  }, "cancel");
}

/** 모집 중 회차에 일정(날짜×동네) 더하기. 그 동네 사용 중 식당마다 2테이블씩 재고를 잡는다(createRound와 같게) */
export async function addSlot(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const me = await requireAdminWrite(`/admin/rounds?r=${roundId}`);
  const round = await loadRound(roundId);
  const region = String(form.get("region") ?? "");
  const maxTables = Number(form.get("max_tables") ?? 0);
  const startsAt = fromKstInput(`${String(form.get("date") ?? "")}T${String(form.get("time") ?? "")}`);
  const errors = checkSlotAdd({
    status: round.status, startsAt, region, maxTables, openRegions: OPEN_REGIONS,
    existing: round.slots.map((x) => ({ startsAt: x.starts_at, region: x.region })),
    deadline: round.apply_deadline, matchAt: round.match_at, now: await now(),
  });
  if (errors.length || !startsAt) return back(roundId, { e: errors[0] ?? "날짜와 시작 시각을 넣어 주세요" }, "slots");
  // 진행 시간은 이 회차의 다른 일정과 같게 (없으면 150분)
  const ref = round.slots[0];
  const minutes = ref ? Math.round((new Date(ref.ends_at).getTime() - new Date(ref.starts_at).getTime()) / 60_000) : 150;
  const { data: slot } = await db()
    .from("slots")
    .insert({ round_id: roundId, region, sido: sidoOf(region) ?? null, starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(), max_tables: maxTables })
    .select("id")
    .single();
  if (!slot) return back(roundId, { e: "일정을 저장하지 못했어요. 잠시 뒤 다시 해 주세요" }, "slots");
  const { data: venues } = await db().from("venues").select("id").eq("region", region).eq("active", true);
  const vs = (venues ?? []).map((v) => ({ venue_id: v.id, slot_id: slot.id, tables_available: 2 }));
  if (vs.length) await db().from("venue_slots").insert(vs);
  const label = `${fmtSlot(startsAt)} ${region}`;
  await logStatus({ entityType: "round", entityId: roundId, field: "slot", from: null, to: slot.id, actor: `admin:${me.id}`, reason: `일정 추가: ${label} · 최대 ${maxTables}테이블 · 식당 재고 ${vs.length}칸` });
  revalidatePath("/admin/rounds");
  back(roundId, { m: `${label} 일정을 더했어요. ${vs.length ? `식당 ${vs.length}곳에 2테이블씩 잡았어요` : "이 동네에 사용 중인 식당이 없어요. 식당 관리에서 먼저 넣어 주세요"}` }, "slots");
}

/** 일정 지우기: 신청자가 없을 때만 */
export async function deleteSlot(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const slotId = String(form.get("slot_id") ?? "");
  const me = await requireAdminWrite(`/admin/rounds?r=${roundId}`);
  const round = await loadRound(roundId);
  const sl = round.slots.find((x) => x.id === slotId);
  if (!sl) return back(roundId, { e: "일정을 찾지 못했어요" }, "slots");
  const { count } = await db()
    .from("application_slots")
    .select("application_id,applications!inner(application_status)", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .neq("applications.application_status", "CANCELED");
  const ok = canDeleteSlot({ status: round.status, applicants: count ?? 0, slotCount: round.slots.length });
  if (!ok.ok) back(roundId, { e: ok.reason }, "slots");
  const { error } = await db().from("slots").delete().eq("id", slotId);
  if (error) back(roundId, { e: "일정을 지우지 못했어요. 잠시 뒤 다시 해 주세요" }, "slots");
  const label = `${fmtSlot(sl.starts_at)} ${sl.region}`;
  await logStatus({ entityType: "round", entityId: roundId, field: "slot", from: slotId, to: "deleted", actor: `admin:${me.id}`, reason: `일정 삭제: ${label} (최대 ${sl.max_tables}테이블, 식당 재고 함께 삭제)` });
  revalidatePath("/admin/rounds");
  back(roundId, { m: `${label} 일정을 지웠어요. 잡아 둔 식당 재고도 함께 풀었어요` }, "slots");
}

/** 일정별 최대 테이블 수(정원) 고치기 */
export async function setMaxTables(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const slotId = String(form.get("slot_id") ?? "");
  const me = await requireAdminWrite(`/admin/rounds?r=${roundId}`);
  const n = Number(form.get("max_tables") ?? 0);
  const round = await loadRound(roundId);
  const sl = round.slots.find((x) => x.id === slotId);
  if (!sl) return back(roundId, { e: "일정을 찾지 못했어요" }, "slots");
  const err = checkMaxTables({ status: round.status, maxTables: n });
  if (err) back(roundId, { e: err }, "slots");
  if (sl.max_tables === n) back(roundId, { m: "바뀐 내용이 없어요" }, "slots");
  const { data: up } = await db().from("slots").update({ max_tables: n }).eq("id", slotId).select("id");
  if (!up?.length) back(roundId, { e: "저장하지 못했어요. 잠시 뒤 다시 해 주세요" }, "slots");
  const label = `${fmtSlot(sl.starts_at)} ${sl.region}`;
  await logStatus({ entityType: "slot", entityId: slotId, field: "max_tables", from: String(sl.max_tables), to: String(n), actor: `admin:${me.id}`, reason: `최대 테이블 수: ${label} ${sl.max_tables} → ${n}` });
  revalidatePath("/admin/rounds");
  back(roundId, { m: `${label} 최대 테이블 수를 ${sl.max_tables}개에서 ${n}개로 바꿨어요` }, "slots");
}
