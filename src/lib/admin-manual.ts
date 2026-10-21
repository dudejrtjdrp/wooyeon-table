// 운영자가 직접 하는 처리 (어드민 '중' 항목): 테이블 식당 바꾸기, 참석 상태 바꾸기, 자동 매칭 지금 돌리기.
// 판단은 admin-manual-rules.ts(순수 함수)에 있고, 여기서는 읽고 쓰고 기록만 한다.
// 식당 바꾸기는 예약이 안 돼 자동으로 바꿀 때(pipeline.ts reassignVenue)와 같은 순서로 예약·단체방·알림을 다시 맞춘다.
import { type AttendOp, ATTEND_OP_LABEL, attendanceChange, canRunMatchNow, canSwapVenue, runResultText, swapCandidates, type SwapCandidate, type SwapOption } from "./admin-manual-rules";
import { quietly, syncScheduled, syncTable } from "./scheduled";
import { now, realNowIso } from "./clock";
import { postSystem } from "./delivery";
import { logStatus } from "./events";
import { notify } from "./notify";
import { ensureRoom, triedVenues } from "./pipeline";
import { db } from "./supabase";
import { loadTemplates, render, slotVars } from "./templates";

type Result = { ok: boolean; message: string };

// ─────────────────────────────────────────────
// 1. 테이블 식당 바꾸기
// ─────────────────────────────────────────────

type SwapTable = { id: string; status: string; slot_id: string; venue_id: string | null; reservation_name: string | null; slots: { starts_at: string; region: string }; venues: { name: string } | null };

async function swapTable(tableId: string) {
  const { data } = await db().from("dining_tables").select("id,status,slot_id,venue_id,reservation_name,slots(starts_at,region),venues(name)").eq("id", tableId).maybeSingle();
  return data as unknown as SwapTable | null;
}

/** 이 테이블이 옮겨 갈 수 있는 식당 (같은 동네·같은 일정, 재고가 남은 곳, 평점 순) */
export async function venueSwapOptions(tableId: string): Promise<SwapCandidate[]> {
  const t = await swapTable(tableId);
  if (!t) return [];
  const [{ data: options }, { count: party }, { data: used }, failed] = await Promise.all([
    db().from("venue_slots").select("venue_id,tables_available,venues(name,active,region,rating,booking_channel,seats_per_table)").eq("slot_id", t.slot_id),
    db().from("applications").select("id", { count: "exact", head: true }).eq("table_id", tableId).eq("match_status", "CONFIRMED"),
    db().from("dining_tables").select("venue_id").eq("slot_id", t.slot_id).not("venue_id", "is", null).neq("status", "DISSOLVED"),
    triedVenues(tableId),
  ]);
  const usedCount = new Map<string, number>();
  for (const u of used ?? []) usedCount.set(u.venue_id, (usedCount.get(u.venue_id) ?? 0) + 1);
  const list: SwapOption[] = ((options ?? []) as unknown as { venue_id: string; tables_available: number; venues: { name: string; active: boolean; region: string; rating: number | null; booking_channel: string | null; seats_per_table: number } | null }[])
    .filter((o) => o.venues)
    .map((o) => ({ venueId: o.venue_id, name: o.venues!.name, region: o.venues!.region, active: o.venues!.active, rating: o.venues!.rating === null ? null : Number(o.venues!.rating), channel: o.venues!.booking_channel, seats: o.venues!.seats_per_table, tablesAvailable: o.tables_available }));
  return swapCandidates(list, { region: t.slots.region, party: party ?? 0, used: usedCount, currentVenueId: t.venue_id, failed });
}

/** 처리할 일을 예외 처리함에 연다. 같은 키로 닫혀 있던 건이면 다시 연다(dedupe 키는 한 건뿐이라) */
async function openTodo(key: string, row: { kind: string; ref_type: string; ref_id: string; reason: string }, actor: string) {
  // 이미 열려 있으면(예: 예약 실패 예외) 내용과 종류를 이번 일로 고쳐 쓴다. 안 그러면 옛 버튼('예약 다시 시도')이 남아 운영자가 고른 식당이 자동으로 바뀔 수 있다
  const { data: open } = await db().from("exceptions").update({ ...row }).eq("dedupe_key", key).eq("status", "open").select("id");
  if (open?.length) return;
  const { data: re } = await db().from("exceptions").update({ ...row, status: "open", resolution: null, resolved_by: null, resolved_at: null }).eq("dedupe_key", key).neq("status", "open").select("id");
  for (const x of re ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "resolved", to: "open", actor, reason: row.reason });
  if (!re?.length) await db().from("exceptions").upsert({ ...row, dedupe_key: key }, { onConflict: "dedupe_key", ignoreDuplicates: true });
}

/**
 * 운영자가 테이블 식당을 바꾼다. 모임 시작 전, 같은 동네·일정에서 자리가 남은 식당으로만.
 * 1) 테이블 식당을 조건부로 바꾸고(두 번 눌러도 한 번) 이력  2) 예약 기록을 새 식당으로 고쳐 다시 요청
 * 3) 첫 공지가 나간 테이블이면 단체방과 참가자에게 바뀐 식당 안내  4) 자동 예약 채널이면 바로 예약 시도
 * 하루 전 안내는 보내는 순간의 식당으로 다시 쓰이므로(pipeline.ts freshReminder) 따로 고치지 않는다.
 */
export async function swapVenue(tableId: string, venueId: string, reason: string, adminId: string): Promise<Result> {
  const actor = `admin:${adminId}`;
  const t = await swapTable(tableId);
  if (!t) return { ok: false, message: "테이블을 찾지 못했어요" };
  const clock = await now();
  const can = canSwapVenue({ status: t.status, hasVenue: !!t.venue_id, startsAt: t.slots.starts_at, now: clock });
  if (!can.ok) return { ok: false, message: can.reason };
  const pick = (await venueSwapOptions(tableId)).find((o) => o.venueId === venueId);
  if (!pick) return { ok: false, message: "고른 식당은 이 일정에 남은 자리가 없거나 이 테이블 인원을 받을 수 없어요. 목록을 새로 고쳐 다시 골라 주세요" };
  const fromId = t.venue_id!;
  const fromName = t.venues?.name ?? "이전 식당";

  const { data: moved } = await db().from("dining_tables").update({ venue_id: pick.venueId }).eq("id", tableId).eq("venue_id", fromId).in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY"]).select("id");
  if (!moved?.length) return { ok: false, message: "그 사이 식당이나 테이블 상태가 바뀌었어요. 새로 고쳐 확인해 주세요" };
  const changeId = await logStatus({ entityType: "dining_table", entityId: tableId, field: "venue_id", from: fromName, to: pick.name, actor, reason: `[운영자 식당 변경] ${reason}` });
  // 예약해 둔 하루 전 안내 문구도 새 식당으로 (보내는 순간에도 다시 쓰지만, 예정된 안내 화면에 옛 식당이 보이지 않게)
  await quietly(syncTable(tableId, actor, `식당 변경 ${fromName} → ${pick.name}`));

  // 예약 기록 (테이블당 한 줄): 새 식당으로 고쳐 처음부터 다시 요청
  const { data: v } = await db().from("venues").select("name,address,booking_channel,booking_url").eq("id", pick.venueId).single();
  const { CHANNEL_LABEL, deepLink, attemptReservation, requestReservation } = await import("./reservations");
  const channel = (v?.booking_channel ?? "phone") as keyof typeof CHANNEL_LABEL;
  const { count: party } = await db().from("applications").select("id", { count: "exact", head: true }).eq("table_id", tableId).eq("match_status", "CONFIRMED");
  const { data: old } = await db().from("reservations").select("id,status,external_ref").eq("table_id", tableId).maybeSingle();
  if (old) {
    await db()
      .from("reservations")
      .update({ venue_id: pick.venueId, channel, status: "REQUESTED", attempts: 0, last_error: null, external_ref: null, mode: "mock", party_size: party ?? 0, deep_link: deepLink(channel, v?.name ?? pick.name, v?.address ?? "", v?.booking_url ?? null), updated_at: clock.toISOString() })
      .eq("id", old.id);
    await logStatus({ entityType: "reservation", entityId: old.id, field: "status", from: old.status, to: "REQUESTED", actor, reason: `운영자가 식당을 바꿔 다시 예약 요청: ${fromName} → ${pick.name} (${CHANNEL_LABEL[channel]})` });
  }

  // 단체방 첫 공지가 이미 나갔으면 바뀐 식당을 알린다. 아직이면 첫 공지에 새 식당이 들어간다
  const { data: notice } = await db().from("chat_messages").select("id").eq("dedupe_key", `notice:${tableId}`).maybeSingle();
  let told = 0;
  if (notice) {
    const tpl = await loadTemplates();
    const msg = render("venue_changed", { ...slotVars(t.slots.starts_at), venue: pick.name }, tpl);
    const roomId = await ensureRoom(tableId);
    // 같은 식당으로 다시 바꾸는 경우도 있어 키를 이번 변경 이력에 묶는다(다시 실행해도 한 번만)
    const stamp = changeId ?? clock.getTime();
    await postSystem(roomId, `${msg.body}\n장소: ${v?.name ?? pick.name}\n주소: ${v?.address ?? ""}\n예약명: ${t.reservation_name ?? ""}`, { dedupeKey: `venue-admin:${tableId}:${pick.venueId}:${stamp}`, meta: { type: "notice" } });
    const { data: ms } = await db().from("applications").select("id,user_id").eq("table_id", tableId).eq("match_status", "CONFIRMED").eq("attendance_status", "SCHEDULED");
    for (const m of ms ?? []) {
      await notify({ userId: m.user_id, template: "venue_changed", title: msg.title, body: msg.body, link: `/tables/${tableId}`, dedupeKey: `venue-admin:${m.id}:${pick.venueId}:${stamp}` });
      told++;
    }
  }

  // 예약: 자동 채널이면 바로 시도(세 번 안 되면 기존 흐름대로 다른 식당 → 예외). 전화 예약은 운영자가 걸고 '예약 완료로 표시'
  // 전화 예약은 자동으로 시도하면 바로 실패로 보고 다른 식당으로 바꿔 버려(운영자가 고른 식당이 무시됨) 시도하지 않고,
  // 예외 처리함에 '직접 예약 필요'로 올려 둔다. 그래야 운영자가 잊어도 모임 전에 처리할 일로 남는다
  let booking: string;
  if (channel === "phone") {
    if (!old) {
      const { data: tb } = await db().from("dining_tables").select("reservation_name").eq("id", tableId).single();
      await db().from("reservations").upsert(
        { table_id: tableId, venue_id: pick.venueId, channel, status: "REQUESTED", party_size: party ?? 0, reserved_for: t.slots.starts_at, reservation_name: tb?.reservation_name ?? `우연한식탁 ${tableId.slice(0, 4).toUpperCase()}`, deep_link: deepLink(channel, v?.name ?? pick.name, v?.address ?? "", v?.booking_url ?? null) },
        { onConflict: "table_id", ignoreDuplicates: true },
      );
    }
    await openTodo(`reservation:${tableId}`, { kind: "reservation", ref_type: "venue_phone", ref_id: tableId, reason: `운영자가 전화 예약 식당(${pick.name})으로 바꿨어요. 식당에 전화로 예약한 뒤 '직접 예약함'을 눌러 주세요` }, actor);
    booking = "전화 예약 식당이라 예외 처리함에 '직접 예약 필요'로 올렸어요. 예약한 뒤 '직접 예약함'을 눌러 주세요";
  } else if (!old) {
    await requestReservation(tableId);
    booking = "예약을 요청했어요";
  } else {
    const st = await attemptReservation(tableId);
    booking = st === "CONFIRMED" ? `${CHANNEL_LABEL[channel]} 예약이 확정됐어요` : `${CHANNEL_LABEL[channel]} 예약이 아직 안 됐어요. 자동으로 다시 시도해요`;
  }
  const { data: after } = await db().from("reservations").select("status").eq("table_id", tableId).maybeSingle();
  if (after?.status === "CONFIRMED") {
    // 식당이 정해지고 예약까지 됐으니 이 테이블의 식당 부족·예약 실패 예외는 닫는다
    const at = clock.toISOString();
    const { data: closed } = await db().from("exceptions").update({ status: "resolved", resolution: `운영자 식당 변경: ${pick.name}`, resolved_by: adminId, resolved_at: realNowIso() }).in("dedupe_key", [`reservation:${tableId}`, `venue:${tableId}`]).eq("status", "open").select("id");
    for (const x of closed ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "open", to: "resolved", actor, reason: `운영자 식당 변경: ${pick.name}` });
  }
  // 이전 식당 예약은 취소 연동이 없어, 확정돼 있었으면 예외 처리함에 '이전 예약 취소'로 남긴다(안 그러면 그 식당에 노쇼 예약이 생긴다)
  let oldRef = "";
  if (old?.status === "CONFIRMED") {
    await openTodo(`reservation-cancel:${tableId}:${fromId}`, { kind: "reservation", ref_type: "venue_cancel", ref_id: tableId, reason: `식당을 바꿔 ${fromName} 예약${old.external_ref ? `(${old.external_ref})` : ""}이 남아 있어요. 식당에 취소한 뒤 '이전 예약 취소함'을 눌러 주세요` }, actor);
    oldRef = ` ${fromName} 예약 취소는 예외 처리함에 올려 뒀어요.`;
  }
  return { ok: true, message: `${fromName}에서 ${pick.name}(으)로 바꿨어요. ${notice ? `단체방과 참가자 ${told}명에게 알렸어요. ` : ""}${booking}.${oldRef}` };
}

// ─────────────────────────────────────────────
// 2. 참석 상태 바꾸기
// ─────────────────────────────────────────────

type AttendApp = { id: string; user_id: string; attendance_status: string | null; table_id: string | null; users: { name: string }; dining_tables: { id: string; status: string; slots: { starts_at: string; ends_at: string } } | null };

/**
 * 운영자가 체크인·노쇼·참석 예정으로 되돌리기를 한다. 조건부로 바꿔 두 번 눌러도 한 번만.
 * 노쇼 확정은 노쇼 규칙(noshow.ts: 90일 기준 경고 → 30일 제한 → 운영자 검토)을 그대로 탄다.
 * 이 신청의 노쇼 후보 예외는 체크인·노쇼로 정하면 닫고, 끝난 모임을 되돌리면 다시 연다(후보가 사라지지 않게).
 * 체크인으로 바꾼 사람은 끝난 모임이면 자동 실행의 후기 요청 안전망이 후기를 요청한다(pipeline.ts feedbackSafetyNet).
 */
export async function setAttendance(appId: string, op: AttendOp, note: string, adminId: string): Promise<Result> {
  const actor = `admin:${adminId}`;
  const { data } = await db().from("applications").select("id,user_id,attendance_status,table_id,users(name),dining_tables(id,status,slots(starts_at,ends_at))").eq("id", appId).eq("match_status", "CONFIRMED").maybeSingle();
  const a = data as unknown as AttendApp | null;
  if (!a?.dining_tables) return { ok: false, message: "테이블이 정해진 신청만 바꿀 수 있어요" };
  const { data: fb } = op === "revert" ? await db().from("feedbacks").select("application_id").eq("application_id", appId).maybeSingle() : { data: null };
  const { data: cand } = op === "noshow" ? await db().from("exceptions").select("id").eq("dedupe_key", `noshow:${appId}`).eq("status", "open").maybeSingle() : { data: null };
  const t = await now();
  const chk = attendanceChange(op, { status: a.attendance_status, tableStatus: a.dining_tables.status, startsAt: a.dining_tables.slots.starts_at, endsAt: a.dining_tables.slots.ends_at, now: t, hasFeedback: !!fb, isCandidate: !!cand });
  if (!chk.ok) return { ok: false, message: chk.reason };

  // 운영자 처리는 앱 체크인이 아니라 checked_in_at을 비워 둔다(예외 처리함의 '참석으로 정정'과 같다)
  const patch = chk.to === "ATTENDED" ? { attendance_status: chk.to } : { attendance_status: chk.to, checked_in_at: null };
  const { data: up } = await db().from("applications").update(patch).eq("id", appId).eq("attendance_status", chk.from).select("id");
  if (!up?.length) return { ok: false, message: "그 사이 다른 곳에서 처리됐어요. 새로 고쳐 확인해 주세요" };
  const why = `[운영자 ${ATTEND_OP_LABEL[op]}] ${note || "참석 관리에서 직접 처리"}`;
  await logStatus({ entityType: "application", entityId: appId, field: "attendance_status", from: chk.from, to: chk.to, actor, reason: why });
  // 노쇼면 후기 다시 요청 같은 예약을 거두고, 참석으로 바뀌면 그대로 둔다
  await quietly(syncScheduled([appId], actor, why));

  const key = `noshow:${appId}`;
  const at = t.toISOString();
  if (op === "revert") {
    // 노쇼 후보 예외는 신청마다 한 건(dedupe)이라, 닫힌 채로 두면 모임이 끝날 때 자동으로 다시 올라오지 않는다. 그래서 다시 연다
    const ended = a.dining_tables.status === "DONE";
    const reopenReason = `${a.users.name}님 체크인 기록이 없어요 (운영자가 참석 예정으로 되돌림)`;
    const { data: re } = await db().from("exceptions").update({ status: "open", reason: reopenReason, resolution: null, resolved_by: null, resolved_at: null }).eq("dedupe_key", key).eq("status", "resolved").select("id");
    for (const x of re ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "resolved", to: "open", actor, reason: "참석 예정으로 되돌려 노쇼 후보로 다시 확인" });
    if (!re?.length && ended) await db().from("exceptions").upsert({ kind: "no_show", ref_type: "application", ref_id: appId, reason: reopenReason, dedupe_key: key }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    const left = chk.from === "NO_SHOW" ? " 노쇼로 걸린 경고·신청 제한은 그대로예요. 풀어야 하면 신청자 상세에서 계정 상태를 바꿔 주세요." : "";
    return { ok: true, message: `${a.users.name}님을 참석 예정으로 되돌렸어요.${ended || re?.length ? " 노쇼 후보로 다시 올렸어요." : ""}${left}` };
  }

  const resolution = op === "checkin" ? "참석 관리에서 체크인 처리" : "참석 관리에서 노쇼 확정";
  const { data: closed } = await db().from("exceptions").update({ status: "resolved", resolution, resolved_by: adminId, resolved_at: realNowIso() }).eq("dedupe_key", key).eq("status", "open").select("id");
  for (const x of closed ?? []) await logStatus({ entityType: "exception", entityId: x.id, field: "status", from: "open", to: "resolved", actor, reason: resolution });

  if (op === "checkin") return { ok: true, message: `${a.users.name}님을 체크인 처리했어요${a.dining_tables.status === "DONE" ? ". 후기 요청은 다음 자동 실행 때 나가요" : ""}` };
  const { applyNoShowPolicy, NOSHOW_WINDOW_DAYS, RESTRICT_DAYS } = await import("./noshow");
  const step = await applyNoShowPolicy(a.user_id, appId, actor, t);
  const stepText = step === "warn" ? "경고를 보냈어요" : step === "restrict" ? `${RESTRICT_DAYS}일 동안 신청을 막았어요` : "영구 제한 검토를 예외 처리함에 올리고, 검토 전까지 신청을 막았어요";
  return { ok: true, message: `${a.users.name}님을 노쇼로 처리했어요. 최근 ${NOSHOW_WINDOW_DAYS}일 기준으로 ${stepText}` };
}

// ─────────────────────────────────────────────
// 3. 자동 매칭 지금 돌리기
// ─────────────────────────────────────────────

/** 지금 돌릴 수 있는지와 확인 문구. 화면과 액션이 같은 판단을 쓴다 */
export async function matchNowCheck(roundId: string) {
  const [{ data: round }, { data: run }, { data: apps }, t] = await Promise.all([
    db().from("rounds").select("id,title,status,apply_deadline,match_at").eq("id", roundId).maybeSingle(),
    db().from("match_runs").select("id").eq("round_id", roundId).maybeSingle(),
    db().from("applications").select("payment_status").eq("round_id", roundId).eq("application_status", "SUBMITTED").eq("match_status", "WAITING"),
    now(),
  ]);
  if (!round) return { round: null, check: { ok: false as const, reason: "회차를 찾지 못했어요" } };
  const paid = (apps ?? []).filter((a) => a.payment_status === "PAID").length;
  const unpaid = (apps ?? []).filter((a) => ["PENDING", "FAILED"].includes(a.payment_status)).length;
  return { round, check: canRunMatchNow({ status: round.status, hasRun: !!run, applyDeadline: round.apply_deadline, matchAt: round.match_at, now: t, paid, unpaid }) };
}

/**
 * 운영자가 매칭 시각 전에 바로 돌린다. 러너(runner.ts runRound)를 그대로 쓴다:
 * match_runs.round_id가 unique라 두 번 눌러도 한 번만 돌고, 닫힌(취소) 회차는 러너도 돌지 않는다.
 */
export async function runMatchNow(roundId: string, adminId: string): Promise<Result> {
  const actor = `admin:${adminId}`;
  const { round, check } = await matchNowCheck(roundId);
  if (!round || !check.ok) return { ok: false, message: check.ok ? "회차를 찾지 못했어요" : check.reason };
  await logStatus({ entityType: "round", entityId: roundId, field: "match_run", to: "운영자 실행", actor, reason: `운영자가 지금 매칭 실행${check.early ? " (신청 마감 전)" : ""}` });
  // 마감 전에 돌리면 신청 마감·매칭 시각을 지금으로 당긴다. 그래야 결제 화면·토스 승인·참가자 화면의 '매칭 시각이 지났는지' 확인이
  // 그대로 걸려, 돌린 뒤에 결제해 아무 테이블에도 못 들어가고 대기로 남는 사람이 생기지 않는다(남은 결제 대기는 '결제 전 마감'으로 보인다)
  const nowAt = await now();
  const t = nowAt.toISOString();
  for (const [field, v] of [["apply_deadline", round.apply_deadline], ["match_at", round.match_at]] as const) {
    if (new Date(v) <= nowAt) continue;
    const { data: moved } = await db().from("rounds").update({ [field]: t }).eq("id", roundId).eq(field, v).select("id");
    if (moved?.length) await logStatus({ entityType: "round", entityId: roundId, field, from: v, to: t, actor, reason: "운영자가 지금 매칭을 돌려 시각을 당김" });
  }
  const { runRound } = await import("./matching/runner");
  let out;
  try {
    out = await runRound(roundId, actor);
  } catch (e) {
    await logStatus({ entityType: "round", entityId: roundId, field: "match_run", from: "운영자 실행", to: "FAILED", actor, reason: String(e).slice(0, 200) }).catch(() => null);
    return { ok: false, message: "매칭 실행이 중간에 실패했어요. 다음 자동 실행 때 다시 돌리고, 그래도 안 되면 예외 처리함에 올라가요" };
  }
  const s = out.summary as Record<string, unknown>;
  const { count: tables } = out.alreadyRan || !out.runId ? { count: 0 } : await db().from("dining_tables").select("id", { count: "exact", head: true }).eq("match_run_id", out.runId);
  const msg = runResultText({ alreadyRan: out.alreadyRan, tables: tables ?? 0, confirmed: Number(s.confirmed ?? 0), failed: Number(s.failed ?? 0), exceptions: Number(s.exceptions ?? 0) });
  await logStatus({ entityType: "round", entityId: roundId, field: "match_run", from: "운영자 실행", to: out.alreadyRan ? "건너뜀" : "완료", actor, reason: msg });
  return { ok: !out.alreadyRan, message: msg };
}
