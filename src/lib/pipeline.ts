import { contentMessage } from "./content-preview";
import { now } from "./clock";
import { REFUND_POLICY } from "./constants";
import { logStatus } from "./events";
import { fmtSlot } from "./format";
import { notify } from "./notify";
import { shouldNudgeCheckIn } from "./attendance-rules";
import { pushNotifications } from "./push";
import { MAX_TRIES, postSystem, retryPushes, retrySystemMessages } from "./delivery";
import { chooseContents, loadContentRules, tableTypes } from "./contents";
import { loadTemplates, render, reservationLine, slotVars, venueInfo } from "./templates";
import { type VenueOption, pickVenue } from "./venue-pick";
import { type Visit, pickSlotFor, recommendBody, visitPrefs } from "./recommend";
import { db } from "./supabase";

type TableRow = {
  id: string;
  status: string;
  venue_id: string | null;
  reservation_name: string | null;
  explanation: { reasons?: string[] };
  slot_id: string;
  slots: { id: string; region: string; starts_at: string; ends_at: string };
};

async function loadTable(tableId: string) {
  const { data } = await db()
    .from("dining_tables")
    .select("id,status,venue_id,reservation_name,explanation,slot_id,slots(id,region,starts_at,ends_at)")
    .eq("id", tableId)
    .single();
  return data as unknown as TableRow;
}

async function members(tableId: string) {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,attendance_status,users(name,profiles(job,interests,mbti,birth_year,my_traits))")
    .eq("table_id", tableId)
    .eq("match_status", "CONFIRMED");
  return (data ?? []) as unknown as {
    id: string;
    user_id: string;
    attendance_status: string | null;
    users: { name: string; profiles: { job: string | null; interests: string[]; mbti: string | null; birth_year: number; my_traits: string[] | null } | null };
  }[];
}

/** 단체방 시스템 메시지. 실패하면 이력을 남기고 스케줄러가 다시 올린다 (INF-08, lib/delivery.ts) */
async function systemMessage(roomId: string, body: string, dedupeKey: string, meta: Record<string, unknown> = {}) {
  await postSystem(roomId, body, { dedupeKey, meta });
}

export async function ensureRoom(tableId: string): Promise<string> {
  await db().from("chat_rooms").upsert({ table_id: tableId }, { onConflict: "table_id", ignoreDuplicates: true });
  const { data } = await db().from("chat_rooms").select("id").eq("table_id", tableId).single();
  return data!.id;
}

/** 이 테이블에 배정할 수 있는 식당 후보와 인원 (같은 일정의 식당 재고) */
async function venueContext(t: TableRow) {
  const [{ data: options }, { data: who }, { data: used }] = await Promise.all([
    db().from("venue_slots").select("venue_id,tables_available,venues(id,name,address,active,region,rating,booking_channel,seats_per_table,price_range)").eq("slot_id", t.slot_id),
    db().from("applications").select("id,users(profiles(price_range))").eq("table_id", t.id).eq("match_status", "CONFIRMED"),
    db().from("dining_tables").select("venue_id").eq("slot_id", t.slot_id).not("venue_id", "is", null).neq("status", "DISSOLVED"),
  ]);
  const usedCount = new Map<string, number>();
  for (const u of used ?? []) usedCount.set(u.venue_id, (usedCount.get(u.venue_id) ?? 0) + 1);
  const list: VenueOption[] = ((options ?? []) as unknown as { venue_id: string; tables_available: number; venues: { name: string; active: boolean; region: string; rating: number | null; booking_channel: string | null; seats_per_table: number; price_range: string | null } | null }[])
    .filter((o) => o.venues)
    .map((o) => ({ venueId: o.venue_id, name: o.venues!.name, region: o.venues!.region, active: o.venues!.active, rating: o.venues!.rating === null ? null : Number(o.venues!.rating), channel: o.venues!.booking_channel, seats: o.venues!.seats_per_table, tablesAvailable: o.tables_available, priceRange: o.venues!.price_range }));
  const members = (who ?? []) as unknown as { users: { profiles: { price_range: string | null } | null } | null }[];
  const prices = members.map((m) => m.users?.profiles?.price_range ?? null);
  return { options: list, party: members.length, used: usedCount, prices };
}

/** 예약이 안 돼 이 테이블에서 뺀 식당 (status_events dining_table · venue_failed) */
export async function triedVenues(tableId: string): Promise<Set<string>> {
  const { data } = await db().from("status_events").select("to_value").eq("entity_type", "dining_table").eq("entity_id", tableId).eq("field", "venue_failed");
  return new Set((data ?? []).map((r) => r.to_value));
}

/**
 * 식당 자동 배정 (INF-02). 같은 지역·일정에서 남은 자리가 있고, 테이블 인원이 앉을 수 있는 식당.
 * 평점 4.3 이상·자동 예약 채널(네이버 예약·캐치테이블)을 먼저, 그다음 평점 높은 순, 같으면 덜 쓴 식당 (lib/venue-pick.ts)
 * 예약이 안 돼 뺀 식당은 다시 고르지 않는다. 후보가 없을 때만 운영자 예외.
 */
export async function assignVenue(tableId: string): Promise<boolean> {
  const t = await loadTable(tableId);
  if (t.venue_id) return true;
  const [ctx, tried] = await Promise.all([venueContext(t), triedVenues(tableId)]);
  const pick = pickVenue(ctx.options, { region: t.slots.region, party: ctx.party, used: ctx.used, exclude: tried, prices: ctx.prices });

  if (!pick) {
    await db().from("exceptions").upsert(
      { kind: "venue_shortage", ref_type: "dining_table", ref_id: tableId, reason: `${t.slots.region} ${fmtSlot(t.slots.starts_at)}에 배정할 수 있는 식당이 없어요${tried.size ? ` (예약이 안 된 ${tried.size}곳 제외)` : ""}`, dedupe_key: `venue:${tableId}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    return false;
  }

  const reservation = `우연한식탁 ${tableId.slice(0, 4).toUpperCase()}`;
  // venue_id가 비어 있을 때만 채운다 (두 번 실행돼도 한 번만 배정)
  const { data: updated } = await db()
    .from("dining_tables")
    .update({ venue_id: pick.venueId, reservation_name: reservation, status: "VENUE_ASSIGNED" })
    .eq("id", tableId)
    .is("venue_id", null)
    .select("id");
  if (updated?.length) {
    await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", from: t.status, to: "VENUE_ASSIGNED", actor: "system", reason: `식당 자동 배정: ${pick.name}` });
    // 식당이 없어 첫 공지가 '정해지는 대로 알려 드릴게요'로 먼저 나간 테이블(운영자가 식당 부족을 해결한 경우)이면 정해진 식당을 따로 알린다
    await announceVenueSet(tableId, t, pick.venueId, reservation);
  }
  // 이어서 식당 예약 요청 (네이버 예약·캐치테이블 어댑터, 실패하면 재시도 → 다른 식당 → 그래도 안 되면 예외)
  const { requestReservation } = await import("./reservations");
  await requestReservation(tableId);
  return true;
}

/** 첫 공지가 식당 없이 나간 뒤 식당이 정해졌을 때: 단체방 시스템 메시지 + 푸시·알림함 (한 테이블에 한 번) */
async function announceVenueSet(tableId: string, t: TableRow, venueId: string, reservation: string) {
  const { data: notice } = await db().from("chat_messages").select("id").eq("dedupe_key", `notice:${tableId}`).maybeSingle();
  if (!notice) return;
  const { data: v } = await db().from("venues").select("name,address").eq("id", venueId).maybeSingle();
  const tpl = await loadTemplates();
  const msg = render("venue_set", { ...slotVars(t.slots.starts_at), venue: v?.name ?? "", reservation }, tpl);
  const roomId = await ensureRoom(tableId);
  await systemMessage(roomId, `${msg.body}\n장소: ${v?.name ?? ""}\n주소: ${v?.address ?? ""}\n예약명: ${reservation}`, `venue-set:${tableId}`, { type: "notice" });
  for (const m of await members(tableId)) {
    await notify({ userId: m.user_id, template: "venue_set", title: msg.title, body: msg.body, link: `/tables/${tableId}`, dedupeKey: `venue-set:${tableId}:${m.id}` });
  }
}

/**
 * 테이블 확정 알림 (INF-01, 14장 '매칭 확정'). 식당 배정·단체방 개설 뒤에 보내 식당명·집합 시간·단체방 안내가 함께 들어간다.
 * 신청마다 한 번만 나간다(confirmed:<신청 id>). 확정 뒤 안내가 실패해도 러너가 이 함수로 알림만은 먼저 보낸다(그때는 식당 없이).
 */
export async function notifyConfirmed(tableId: string) {
  const t = await loadTable(tableId);
  if (!t || t.status === "DISSOLVED") return 0;
  const { data: v } = t.venue_id ? await db().from("venues").select("name").eq("id", t.venue_id).maybeSingle() : { data: null };
  const tpl = await loadTemplates();
  const msg = render("confirmed", { ...slotVars(t.slots.starts_at), region: t.slots.region, venue: v?.name ?? "", venue_info: venueInfo(v?.name, t.reservation_name) }, tpl);
  const ms = await members(tableId);
  for (const m of ms) {
    await notify({ userId: m.user_id, template: "confirmed", title: msg.title, body: msg.body, link: `/tables/${tableId}`, dedupeKey: `confirmed:${m.id}` });
  }
  return ms.length;
}

/**
 * 예약이 끝내 안 된 식당을 빼고 같은 지역·일정의 다른 식당으로 바꾼다 (PRD 15장 식당 배정 실패).
 * 예약 기록(reservations, 테이블당 한 줄)은 새 식당으로 고쳐 쓰고, 바꾼 이력은 status_events에 남긴다.
 * 바꿀 식당이 있으면 새 예약 시도 결과를, 없으면 null을 돌려준다(그때만 호출한 쪽이 예외 큐에 올린다).
 */
export async function reassignVenue(tableId: string, failedVenueId: string, why: string): Promise<string | null> {
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "venue_failed", to: failedVenueId, actor: "system", reason: why });
  const t = await loadTable(tableId);
  if (t.venue_id !== failedVenueId || !["CONFIRMED", "VENUE_ASSIGNED", "READY"].includes(t.status)) return null;
  const [ctx, tried] = await Promise.all([venueContext(t), triedVenues(tableId)]);
  tried.add(failedVenueId);
  const pick = pickVenue(ctx.options, { region: t.slots.region, party: ctx.party, used: ctx.used, exclude: tried, prices: ctx.prices });
  if (!pick) return null;

  const { data: moved } = await db().from("dining_tables").update({ venue_id: pick.venueId }).eq("id", tableId).eq("venue_id", failedVenueId).select("id");
  if (!moved?.length) return null;
  await logStatus({ entityType: "dining_table", entityId: tableId, field: "venue_id", from: failedVenueId, to: pick.venueId, actor: "system", reason: `예약이 안 돼 다른 식당으로: ${pick.name}` });

  const { data: v } = await db().from("venues").select("name,address,booking_channel,booking_url").eq("id", pick.venueId).single();
  const { CHANNEL_LABEL, deepLink } = await import("./reservations");
  const channel = (v?.booking_channel ?? "phone") as keyof typeof CHANNEL_LABEL;
  const { data: rsv } = await db()
    .from("reservations")
    .update({ venue_id: pick.venueId, channel, status: "REQUESTED", attempts: 0, last_error: null, external_ref: null, mode: "mock", party_size: ctx.party, deep_link: deepLink(channel, v?.name ?? pick.name, v?.address ?? "", v?.booking_url ?? null), updated_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .select("id")
    .maybeSingle();
  if (rsv) await logStatus({ entityType: "reservation", entityId: rsv.id, field: "status", from: "FAILED", to: "REQUESTED", actor: "system", reason: `식당을 바꿔 다시 예약 요청: ${pick.name} (${CHANNEL_LABEL[channel]})` });

  // 단체방 첫 공지가 이미 나갔으면 바뀐 식당을 알린다. 아직이면 첫 공지에 새 식당이 들어간다
  const { data: notice } = await db().from("chat_messages").select("id").eq("dedupe_key", `notice:${tableId}`).maybeSingle();
  if (notice) {
    const tpl = await loadTemplates();
    const msg = render("venue_changed", { ...slotVars(t.slots.starts_at), venue: pick.name }, tpl);
    const roomId = await ensureRoom(tableId);
    await systemMessage(roomId, `${msg.body}\n장소: ${v?.name ?? pick.name}\n주소: ${v?.address ?? ""}\n예약명: ${t.reservation_name ?? ""}`, `venue-change:${tableId}:${pick.venueId}`, { type: "notice" });
    for (const m of await members(tableId)) {
      await notify({ userId: m.user_id, template: "venue_changed", title: msg.title, body: msg.body, link: `/tables/${tableId}`, dedupeKey: `venue-change:${m.id}:${pick.venueId}` });
    }
  }
  const { attemptReservation } = await import("./reservations");
  return attemptReservation(tableId);
}

/** 확정 직후 실행: 식당 배정 → 단체방 → 첫 공지 → 리마인드 예약 (INF-01~07) */
export async function afterConfirm(tableId: string) {
  const hasVenue = await assignVenue(tableId);
  const t = await loadTable(tableId);
  const roomId = await ensureRoom(tableId);
  const ms = await members(tableId);

  let venueLine = "식당은 정해지는 대로 이 방에 알려드릴게요.";
  if (t.venue_id) {
    const { data: v } = await db().from("venues").select("name,address").eq("id", t.venue_id).single();
    venueLine = `장소: ${v?.name}\n주소: ${v?.address}\n예약명: ${t.reservation_name}`;
  }
  const intro = ms
    .map((m) => `· ${m.users.name}${m.users.profiles?.job ? ` (${m.users.profiles.job})` : ""}`)
    .join("\n");
  const reasons = (t.explanation?.reasons ?? []).join(", ");

  await systemMessage(
    roomId,
    [
      `${fmtSlot(t.slots.starts_at)}, ${t.slots.region}에서 만나요.`,
      venueLine,
      "",
      `함께할 분들이에요.\n${intro}`,
      reasons ? `\n이렇게 모였어요: ${reasons}` : "",
      "",
      `취소 규정\n${REFUND_POLICY.slice(0, 3).map((r) => `· ${r}`).join("\n")}`,
    ]
      .filter((x) => x !== undefined)
      .join("\n"),
    `notice:${tableId}`,
    { type: "notice" },
  );

  // 확정 알림은 식당·단체방이 준비된 뒤에 보낸다 (식당명·집합 시간·단체방 안내가 들어가게)
  await notifyConfirmed(tableId);

  if (hasVenue) {
    const { data: updated } = await db().from("dining_tables").update({ status: "READY" }).eq("id", tableId).eq("status", "VENUE_ASSIGNED").select("id");
    if (updated?.length) {
      await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", from: "VENUE_ASSIGNED", to: "READY", actor: "system", reason: "단체방 개설과 첫 공지 완료" });
    }
  }

  // 하루 전 리마인드 예약 (INF-07). 시각이 되면 tick이 발송 처리한다
  const remindAt = new Date(new Date(t.slots.starts_at).getTime() - 24 * 60 * 60 * 1000);
  const tpl = await loadTemplates();
  const { data: vn } = t.venue_id ? await db().from("venues").select("name").eq("id", t.venue_id).maybeSingle() : { data: null };
  // 문구는 보낼 때 최신 식당·예약명으로 다시 만든다(tick → freshReminder). 여기서는 자리만 잡아 둔다
  const rm = render("reminder", { ...slotVars(t.slots.starts_at), region: t.slots.region, venue: vn?.name ?? "식당은 모임 정보에서", reservation: t.reservation_name ?? "" }, tpl);
  for (const m of ms) {
    await notify({
      userId: m.user_id,
      template: "reminder",
      title: rm.title,
      body: rm.body,
      link: `/tables/${tableId}`,
      dedupeKey: `remind:${m.id}`,
      scheduledAt: remindAt,
    });
  }
}

/** 테이블 공통 관심사와 대화 성향(MBTI E/I·본인 성향)으로 대화 주제 3개 + 아이스브레이킹 1개를 고른다 (CON-01, CON-02) */
export async function pickContents(tableId: string) {
  const ms = await members(tableId);
  const count = new Map<string, number>();
  for (const m of ms) for (const i of m.users.profiles?.interests ?? []) count.set(i, (count.get(i) ?? 0) + 1);
  const common = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  // 테이블 유형 (CON-04): 첫 참가 위주인지, 인원, 나이대
  const { data: past } = ms.length
    ? await db().from("applications").select("user_id").in("user_id", ms.map((m) => m.user_id)).eq("attendance_status", "ATTENDED").neq("table_id", tableId)
    : { data: [] };
  const pastCount = new Map<string, number>();
  for (const p of past ?? []) pastCount.set(p.user_id, (pastCount.get(p.user_id) ?? 0) + 1);
  const t = await loadTable(tableId);
  const types = tableTypes(
    ms.map((m) => ({ birthYear: m.users.profiles?.birth_year ?? 1995, pastAttended: pastCount.get(m.user_id) ?? 0, mbti: m.users.profiles?.mbti ?? null, traits: m.users.profiles?.my_traits ?? [] })),
    new Date(t.slots.starts_at).getFullYear(),
  );

  const [{ data: all }, rules] = await Promise.all([
    db().from("conversation_contents").select("id,kind,tags,table_types,priority,body").eq("active", true),
    loadContentRules(),
  ]);
  // 공통 관심사 + 테이블 유형(대화 성향 포함)으로 고른다. 성향에 맞춘 주제가 하나는 꼭 들어간다
  const { topics, icebreakers } = chooseContents(all ?? [], common, types, rules, tableId);
  return { topics, icebreaker: icebreakers[0] ?? null, icebreakers, common: common.slice(0, 3), types };
}

/**
 * 시간이 흐르면 해야 할 일을 처리한다. 스케줄러, 어드민 화면, 시연 패널이 부른다.
 * 모든 단계가 중복 방지 키를 써서 몇 번을 불러도 결과는 한 번만 생긴다.
 */
export async function tick() {
  const t = await now();
  const iso = t.toISOString();
  const done: string[] = [];

  // 1. 마감 시각이 지난 차수 자동 매칭 (MAT-01). 한 차수가 실패해도 다음 일은 계속한다
  const { data: due } = await db().from("rounds").select("id,title").eq("status", "open").lte("match_at", iso);
  if (due?.length) {
    const { runRound } = await import("./matching/runner");
    for (const r of due) {
      try {
        await runRound(r.id);
        done.push(`${r.title} 자동 매칭`);
      } catch (e) {
        console.error("[tick] 자동 매칭 실패", r.id, e);
        done.push(`${r.title} 자동 매칭 실패 (다음 실행에서 복구)`);
      }
    }
  }
  // 1-1. 멈춘 매칭 복구: 실패했거나 10분 넘게 '실행 중'인 회차 (MAT-13)
  const rec = await recoverMatchRuns(t).catch(() => ({ retried: 0, escalated: 0 }));
  if (rec.retried) done.push(`멈춘 매칭 ${rec.retried}건 다시 실행`);
  if (rec.escalated) done.push(`멈춘 매칭 ${rec.escalated}건 운영자 확인 요청`);
  // 1-2. 확정됐는데 첫 공지가 없는 테이블은 확정 뒤 안내를 다시 한다 (식당·단체방·공지·리마인드)
  const resumed = await resumeAfterConfirm(t).catch(() => 0);
  if (resumed) done.push(`확정 뒤 안내 다시 하기 ${resumed}건`);

  // 2. 예약된 알림 발송 (INF-07, INF-08)
  const tpl = await loadTemplates();
  const { data: pending } = await db().from("notifications").select("id,attempts,dedupe_key").eq("status", "pending").lte("scheduled_at", iso).limit(200);
  const sentNow: string[] = [];
  for (const n of pending ?? []) {
    // 보낼 때가 됐어도 이유가 사라진 알림은 보내지 않는다 (이미 결제함, 이미 후기 남김)
    const key = n.dedupe_key ?? "";
    if (key.startsWith("payment_pending:")) {
      const { data: a } = await db().from("applications").select("payment_status,application_status").eq("id", key.split(":")[1]).maybeSingle();
      if (!a || a.application_status === "CANCELED" || !["PENDING", "FAILED"].includes(a.payment_status)) {
        await db().from("notifications").delete().eq("id", n.id);
        continue;
      }
    }
    // 하루 전 리마인드는 보내는 순간의 식당·예약명·테이블로 다시 쓴다 (식당이 나중에 정해지거나 테이블을 옮긴 경우)
    let fresh: { title: string; body: string; link: string } | null = null;
    if (key.startsWith("remind:")) {
      fresh = await freshReminder(n.id, key, tpl);
      if (!fresh) {
        await db().from("notifications").delete().eq("id", n.id);
        continue;
      }
    }
    if (key.startsWith("feedback-remind:")) {
      const { data: f } = await db().from("feedbacks").select("application_id").eq("application_id", key.split(":")[1]).maybeSingle();
      if (f) {
        await db().from("notifications").delete().eq("id", n.id);
        continue;
      }
    }
    const { data: up, error } = await db().from("notifications").update({ status: "sent", sent_at: iso, ...(fresh ?? {}) }).eq("id", n.id).eq("status", "pending").select("id");
    if (up?.length) sentNow.push(n.id);
    if (error) {
      const attempts = (n.attempts ?? 0) + 1;
      await db().from("notifications").update({ attempts, last_error: error.message, status: attempts >= MAX_TRIES ? "failed" : "pending" }).eq("id", n.id);
      await logStatus({ entityType: "notification", entityId: n.id, field: "status", from: "pending", to: attempts >= MAX_TRIES ? "failed" : "pending", actor: "system", reason: `알림함 저장 실패 ${attempts}번째: ${error.message}` }).catch(() => null);
      if (attempts >= MAX_TRIES) {
        await db().from("exceptions").upsert(
          { kind: "notification", ref_type: "notification", ref_id: n.id, reason: "알림을 세 번 보내지 못했어요", dedupe_key: `notify:${n.id}` },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
      }
    }
  }
  await pushNotifications(sentNow).catch(() => null);
  if (pending?.length) done.push(`예약 알림 ${pending.length}건 발송`);

  // 2-0. 발송 실패 재시도 (INF-08): 푸시·단체방 메시지를 10분 간격으로 3번까지, 그래도 안 되면 예외 큐
  const rp = await retryPushes(t.getTime()).catch(() => 0);
  if (rp) done.push(`푸시 다시 보내기 ${rp}건`);
  const rs = await retrySystemMessages().catch(() => 0);
  if (rs) done.push(`단체방 안내 다시 올리기 ${rs}건`);

  // 2-1. 빈자리 제안 응답 기한이 지난 건은 다음 대기자에게 넘긴다 (STA-07)
  const { expireOffers } = await import("./attendance");
  const expired = await expireOffers();
  if (expired) done.push(`빈자리 제안 ${expired}건 기한 만료, 다음 대기자 확인`);

  // 식당 예약 재시도 (3번 실패하면 같은 동네 다른 식당으로, 후보가 모두 안 될 때만 예외 큐)
  const { retryReservations } = await import("./reservations");
  const retried = await retryReservations();
  if (retried) done.push(`식당 예약 재시도 ${retried}건`);

  // 매칭 실패 뒤: 하루 전 다시 알림, 3일 무응답·기다리기 마감이면 이용권 보관
  const { autoResolve } = await import("./resolve");
  const ar = await autoResolve();
  if (ar.reminded) done.push(`실패 안내 다시 알림 ${ar.reminded}건`);
  if (ar.kept) done.push(`3일 무응답 이용권 보관 ${ar.kept}건`);
  if (ar.waitOver) done.push(`기다리기 마감 이용권 보관 ${ar.waitOver}건`);

  // 환불 실패 자동 재시도: 10분 간격 3번까지, 세 번째 실패만 예외 큐 (D7)
  const { retryRefunds } = await import("./payments");
  const rf = await retryRefunds().catch(() => ({ retried: 0, done: 0 }));
  if (rf.retried) done.push(`환불 다시 시도 ${rf.retried}건 (완료 ${rf.done}건)`);

  // 시연 봇 체크인: 모임 종료 처리(노쇼 후보)보다 먼저 (lib/sim/bots.ts, settings demo.bots로 끔)
  const { botArrivals, botTick } = await import("./sim/bots");
  const arrived = await botArrivals(t).catch(() => 0);
  if (arrived) done.push(`시연 봇 체크인 ${arrived}건`);

  // 3. 테이블 일정에 따른 단체방 게시와 상태 전환
  const { data: tables } = await db()
    .from("dining_tables")
    .select("id,status,reservation_name,slots(starts_at,ends_at,region),venues(name)")
    .in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY", "IN_PROGRESS"]);
  for (const raw of tables ?? []) {
    const tb = raw as unknown as { id: string; status: string; reservation_name: string | null; slots: { starts_at: string; ends_at: string; region: string }; venues: { name: string } | null };
    const start = new Date(tb.slots.starts_at);
    const end = new Date(tb.slots.ends_at);
    const roomId = await ensureRoom(tb.id);

    if (t.getTime() >= start.getTime() - 24 * 60 * 60 * 1000 && t < start) {
      await systemMessage(
        roomId,
        render("reminder_chat", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "", reservation: tb.reservation_name ?? "", reservation_line: reservationLine(tb.reservation_name) }, tpl).body,
        `remind:${tb.id}`,
        { type: "reminder" },
      );
    }

    if (t >= start && tb.status !== "IN_PROGRESS") {
      const c = await pickContents(tb.id);
      await systemMessage(
        roomId,
        // 어드민 대화 콘텐츠 화면의 미리 보기와 같은 함수로 만든다(화면과 실제 게시가 어긋나지 않게)
        contentMessage(c.topics, c.icebreakers),
        `content:${tb.id}`,
        { type: "content", common: c.common, types: c.types },
      );
      const { data: up } = await db().from("dining_tables").update({ status: "IN_PROGRESS" }).eq("id", tb.id).in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY"]).select("id");
      if (up?.length) await logStatus({ entityType: "dining_table", entityId: tb.id, field: "status", from: tb.status, to: "IN_PROGRESS", actor: "system", reason: "모임 시작 시각" });
    }

    // 시작 20분이 지나도 체크인하지 않은 사람에게 한 번 알린다 (갔는데 체크인을 깜빡해 노쇼 후보가 되는 일을 줄인다)
    if (shouldNudgeCheckIn(start, end, t)) {
      const ms = await members(tb.id);
      for (const m of ms.filter((x) => x.attendance_status === "SCHEDULED")) {
        await notify({ userId: m.user_id, template: "checkin_nudge", ...render("checkin_nudge", {}, tpl), link: `/tables/${tb.id}`, dedupeKey: `checkin:${m.id}` });
      }
    }

    if (t >= end) {
      const { data: up } = await db().from("dining_tables").update({ status: "DONE" }).eq("id", tb.id).neq("status", "DONE").select("id");
      if (up?.length) {
        await logStatus({ entityType: "dining_table", entityId: tb.id, field: "status", from: "IN_PROGRESS", to: "DONE", actor: "system", reason: "모임 종료 시각" });
        await systemMessage(roomId, "오늘 함께해 주셔서 고마워요. 후기를 남겨 주시면 다음 테이블이 더 좋아져요.", `bye:${tb.id}`, { type: "bye" });
        const ms = await members(tb.id);
        for (const m of ms) {
          if (m.attendance_status === "SCHEDULED") {
            // 체크인이 없으면 노쇼 후보로만 올린다. 확정은 운영자가 한다 (FDB-01)
            await db().from("exceptions").upsert(
              { kind: "no_show", ref_type: "application", ref_id: m.id, reason: `${m.users.name}님 체크인 기록이 없어요`, dedupe_key: `noshow:${m.id}` },
              { onConflict: "dedupe_key", ignoreDuplicates: true },
            );
          } else if (m.attendance_status === "ATTENDED") {
            await askFeedback(m.id, m.user_id, tb.id, t, tpl);
          }
        }
      }
    }
  }
  // 3-1. 후기 요청 안전망: 끝난 모임에서 참석했는데 후기 요청을 못 받은 사람 (늦게 체크인 처리된 경우 등)
  const fbs = await feedbackSafetyNet(t, tpl).catch(() => 0);
  if (fbs) done.push(`후기 요청 다시 보내기 ${fbs}건`);
  // 3-2. 시연 봇 단체방 대화·답장·후기 (대화 주제·끝 인사가 올라간 뒤에)
  done.push(...(await botTick(t).catch((e) => (console.error("[tick] 시연 봇 실패", e), []))));

  // 4. 모집 중인 회차를 지난 참가자에게 추천 (새 일정 소식 받기에 동의한 사람만)
  const recommended = await recommendOpenRounds(t, tpl);
  if (recommended) done.push(`다음 일정 추천 ${recommended}건`);
  // 운영자 화면에 '마지막 자동 실행'으로 보여 준다
  await db().from("settings").upsert({ key: "tick.ran", value: { at: new Date().toISOString(), done } }, { onConflict: "key" }).then(() => null, () => null);
  return done;
}

/**
 * 화면을 열 때 부르는 보조 실행. 최근 gap초 안에 누가 이미 돌렸으면 건너뛴다.
 * 여러 요청이 동시에 와도 settings 'tick.claim'을 먼저 바꾼 한 곳만 돈다 (낙관적 잠금).
 */
export async function maybeTick(gapSec = 120): Promise<string[] | null> {
  const { data } = await db().from("settings").select("value").eq("key", "tick.claim").maybeSingle();
  const prev: string | undefined = data?.value?.at;
  if (prev && Date.now() - Date.parse(prev) < gapSec * 1000) return null;
  const at = new Date().toISOString();
  if (prev) {
    const { data: won } = await db().from("settings").update({ value: { at } }).eq("key", "tick.claim").eq("value->>at", prev).select("key");
    if (!won?.length) return null;
  } else {
    const { error } = await db().from("settings").insert({ key: "tick.claim", value: { at } });
    if (error) return null;
  }
  return tick();
}

async function recommendOpenRounds(t: Date, tpl: Awaited<ReturnType<typeof loadTemplates>>) {
  const { data: rounds } = await db().from("rounds").select("id,title,apply_deadline,slots(region,starts_at)").eq("status", "open").gt("apply_deadline", t.toISOString());
  if (!rounds?.length) return 0;
  const { data: past } = await db()
    .from("applications")
    .select("id,user_id,dining_tables(slots(region,starts_at)),users(profiles(marketing_opt_in))")
    .eq("attendance_status", "ATTENDED");
  type Past = { id: string; user_id: string; dining_tables: { slots: { region: string; starts_at: string } } | null; users: { profiles: { marketing_opt_in: boolean } | { marketing_opt_in: boolean }[] | null } };
  const rows = ((past ?? []) as unknown as Past[]).filter((p) => {
    const prof = Array.isArray(p.users?.profiles) ? p.users.profiles[0] : p.users?.profiles;
    return p.dining_tables?.slots && prof?.marketing_opt_in;
  });
  if (!rows.length) return 0;
  // 식당 점수는 후기에서 (참석 이력 전체를 본다)
  const { data: fbs } = await db().from("feedbacks").select("application_id,venue_score").in("application_id", rows.map((r) => r.id));
  const venueScore = new Map((fbs ?? []).map((f) => [f.application_id, f.venue_score as number | null]));
  const visitsByUser = new Map<string, Visit[]>();
  for (const p of rows) {
    const s = p.dining_tables!.slots;
    visitsByUser.set(p.user_id, [...(visitsByUser.get(p.user_id) ?? []), { region: s.region, startsAt: s.starts_at, venueScore: venueScore.get(p.id) ?? null }]);
  }
  let sent = 0;
  for (const r of rounds) {
    const { data: applied } = await db().from("applications").select("user_id").eq("round_id", r.id);
    const has = new Set((applied ?? []).map((a) => a.user_id));
    for (const [uid, visits] of visitsByUser) {
      if (has.has(uid)) continue;
      const prefs = visitPrefs(visits);
      const pick = pickSlotFor(r.slots ?? [], prefs);
      const msg = render("next_round", { recommendation: recommendBody(r.title, pick, prefs, fmtSlot), deadline: fmtSlot(r.apply_deadline) }, tpl);
      await notify({ userId: uid, template: "next_round", title: msg.title, body: msg.body, link: `/apply/${r.id}`, dedupeKey: `next-round:${r.id}:${uid}` });
      sent++;
    }
  }
  return sent;
}

/** 후기 요청과 하루 뒤 한 번 더 알림 (FDB, 15장 피드백 미응답). 같은 신청엔 한 번씩만 */
async function askFeedback(appId: string, userId: string, tableId: string, t: Date, tpl: Awaited<ReturnType<typeof loadTemplates>>) {
  const fb = render("feedback", {}, tpl);
  await notify({ userId, template: "feedback", title: fb.title, body: fb.body, link: `/tables/${tableId}/feedback`, dedupeKey: `feedback:${appId}` });
  // 하루 뒤에도 후기가 없으면 한 번만 더 알린다. 다음 신청을 막지는 않는다
  await notify({ userId, template: "feedback_remind", ...render("feedback_remind", {}, tpl), link: `/tables/${tableId}/feedback`, dedupeKey: `feedback-remind:${appId}`, scheduledAt: new Date(t.getTime() + 24 * 3600_000) });
}

/** 후기 요청 안전망이 거슬러 보는 기간. 시연용 가정(팀이 정한 값) */
export const FEEDBACK_SAFETY_NET_DAYS = 7;
/** 막 확정된 테이블은 러너가 안내 중일 수 있어 이만큼은 다시 하지 않는다. 시연용 가정(팀이 정한 값) */
export const RESUME_GRACE_MS = 2 * 60_000;

/** 끝난 지 7일 안 된 모임에서 참석했는데 후기도, 후기 요청도 없는 사람에게 요청을 보낸다 */
async function feedbackSafetyNet(t: Date, tpl: Awaited<ReturnType<typeof loadTemplates>>): Promise<number> {
  const { data } = await db()
    .from("applications")
    .select("id,user_id,table_id,dining_tables!inner(status,slots!inner(ends_at))")
    .eq("attendance_status", "ATTENDED")
    .eq("dining_tables.status", "DONE")
    .gt("dining_tables.slots.ends_at", new Date(t.getTime() - FEEDBACK_SAFETY_NET_DAYS * 86400_000).toISOString())
    .limit(300);
  const apps = (data ?? []) as unknown as { id: string; user_id: string; table_id: string }[];
  if (!apps.length) return 0;
  const [{ data: asked }, { data: given }] = await Promise.all([
    db().from("notifications").select("dedupe_key").in("dedupe_key", apps.map((a) => `feedback:${a.id}`)),
    db().from("feedbacks").select("application_id").in("application_id", apps.map((a) => a.id)),
  ]);
  const skip = new Set([...(asked ?? []).map((n) => String(n.dedupe_key).slice("feedback:".length)), ...(given ?? []).map((f) => f.application_id)]);
  let n = 0;
  for (const a of apps) {
    if (skip.has(a.id)) continue;
    await askFeedback(a.id, a.user_id, a.table_id, t, tpl);
    n++;
  }
  return n;
}

/**
 * 하루 전 리마인드를 보내는 순간의 정보로 다시 쓴다. 키는 remind:<신청 id>(운영자가 옮긴 경우 remind:<신청 id>:<테이블 id>).
 * 이제 보낼 이유가 없으면(취소·테이블 해제) null, 같은 신청에 이미 리마인드가 나갔어도 null.
 */
/**
 * 단체방 하루 전 안내를 지금 식당·예약명으로 다시 쓴다.
 * 테이블이 해제됐거나 모임이 시작됐으면 skip(다시 올릴 이유가 없음). 테이블을 못 찾으면 body 없이 돌려 원래 문구를 쓰게 한다
 */
export async function freshRoomReminder(tableId: string): Promise<{ skip?: true; body?: string }> {
  const { data } = await db().from("dining_tables").select("id,status,reservation_name,slots(starts_at,region),venues(name)").eq("id", tableId).maybeSingle();
  const tb = data as unknown as { status: string; reservation_name: string | null; slots: { starts_at: string; region: string } | null; venues: { name: string } | null } | null;
  if (!tb?.slots) return {};
  if (["DISSOLVED", "DONE", "IN_PROGRESS"].includes(tb.status) || new Date(tb.slots.starts_at) <= (await now())) return { skip: true };
  const tpl = await loadTemplates();
  return { body: render("reminder_chat", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "", reservation: tb.reservation_name ?? "", reservation_line: reservationLine(tb.reservation_name) }, tpl).body };
}

export async function freshReminder(notificationId: string, key: string, tpl: Awaited<ReturnType<typeof loadTemplates>>): Promise<{ title: string; body: string; link: string } | null> {
  const appId = key.split(":")[1];
  const { data: app } = await db().from("applications").select("id,match_status,attendance_status,table_id").eq("id", appId).maybeSingle();
  if (!app || app.match_status !== "CONFIRMED" || app.attendance_status !== "SCHEDULED" || !app.table_id) return null;
  const { data: dup } = await db().from("notifications").select("id").like("dedupe_key", `remind:${appId}%`).eq("status", "sent").neq("id", notificationId).limit(1);
  if (dup?.length) return null;
  const { data } = await db().from("dining_tables").select("id,status,reservation_name,slots(starts_at,region),venues(name)").eq("id", app.table_id).maybeSingle();
  const tb = data as unknown as { id: string; status: string; reservation_name: string | null; slots: { starts_at: string; region: string }; venues: { name: string } | null } | null;
  if (!tb || tb.status === "DISSOLVED") return null;
  const m = render("reminder", { ...slotVars(tb.slots.starts_at), region: tb.slots.region, venue: tb.venues?.name ?? "식당은 모임 정보에서", reservation: tb.reservation_name ?? "" }, tpl);
  return { title: m.title, body: m.body, link: `/tables/${tb.id}` };
}

/** 확정·식당 배정까지 됐는데 단체방 첫 공지가 없는 테이블에 확정 뒤 안내를 다시 한다 (afterConfirm은 여러 번 불러도 한 번만 생긴다) */
async function resumeAfterConfirm(t: Date): Promise<number> {
  // 아직 시작 전인 테이블만 (지난 모임에 안내를 새로 올리지 않게)
  const { data: tables } = await db().from("dining_tables").select("id,confirmed_at,slots!inner(starts_at)").in("status", ["CONFIRMED", "VENUE_ASSIGNED"]).gt("slots.starts_at", t.toISOString()).limit(100);
  if (!tables?.length) return 0;
  const { data: notices } = await db().from("chat_messages").select("dedupe_key").in("dedupe_key", tables.map((x) => `notice:${x.id}`));
  const has = new Set((notices ?? []).map((m) => m.dedupe_key));
  // 막 확정돼 러너가 아직 안내 중인 테이블은 건너뛴다(2분)
  const fresh = Date.now() - RESUME_GRACE_MS;
  let n = 0;
  for (const x of tables) {
    if (has.has(`notice:${x.id}`) || (x.confirmed_at && Date.parse(x.confirmed_at) > fresh)) continue;
    try {
      await afterConfirm(x.id);
      await logStatus({ entityType: "dining_table", entityId: x.id, field: "after_confirm", to: "RESUMED", actor: "system", reason: "첫 공지가 없어 확정 뒤 안내를 다시 함" });
      n++;
    } catch (e) {
      console.error("[tick] 확정 뒤 안내 다시 하기 실패", x.id, e);
      await db().from("exceptions").upsert(
        { kind: "notification", ref_type: "dining_table", ref_id: x.id, reason: `확정된 테이블의 단체방 첫 안내를 올리지 못했어요 (${String(e).slice(0, 120)})`, dedupe_key: `after_confirm:${x.id}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    }
  }
  return n;
}

/** 실행 중으로 이만큼 넘게 남아 있으면 멈춘 것으로 본다 (서버 함수 제한 시간 60초보다 넉넉히). 시연용 가정(팀이 정한 값) */
export const STUCK_RUN_MS = 10 * 60_000;

/**
 * 멈춘 매칭 복구 (MAT-01·MAT-13).
 * - 실패했거나 10분 넘게 '실행 중'인 매칭 실행을 찾는다.
 * - 테이블이 하나도 안 만들어졌으면 '매칭 중'으로 묶였던 신청을 대기로 돌리고 한 번 다시 돌린다.
 * - 테이블이 일부 만들어졌거나 다시 돌려도 실패하면 운영자 예외 큐(data_missing, ref match_run)로 올린다.
 */
export async function recoverMatchRuns(t: Date): Promise<{ retried: number; escalated: number }> {
  const res = { retried: 0, escalated: 0 };
  // started_at은 실제 시각으로 찍히니 실제 시각으로 잰다. 일주일 넘은 실행은 이미 사람이 봤다고 보고 건드리지 않는다
  const stuckBefore = new Date(Date.now() - STUCK_RUN_MS).toISOString();
  const recent = new Date(Date.now() - 7 * 86400_000).toISOString();
  const cols = "id,round_id,status,started_at,summary,rounds(title,slots(starts_at))";
  const [{ data: failed }, { data: stuck }] = await Promise.all([
    db().from("match_runs").select(cols).eq("status", "failed").gt("started_at", recent).limit(20),
    db().from("match_runs").select(cols).eq("status", "running").lt("started_at", stuckBefore).gt("started_at", recent).limit(20),
  ]);
  for (const raw of [...(failed ?? []), ...(stuck ?? [])] as unknown as { id: string; round_id: string; status: string; summary: { error?: string } | null; rounds: { title: string; slots: { starts_at: string }[] } | null }[]) {
    const { data: open } = await db().from("exceptions").select("id").eq("dedupe_key", `match_run:${raw.id}`).maybeSingle();
    if (open) continue; // 이미 운영자에게 넘긴 실행
    if (raw.status === "running") {
      const { data: up } = await db().from("match_runs").update({ status: "failed", summary: { ...(raw.summary ?? {}), error: "10분 넘게 끝나지 않아 멈춘 것으로 봄" }, finished_at: new Date().toISOString() }).eq("id", raw.id).eq("status", "running").select("id");
      if (!up?.length) continue;
    }
    const title = raw.rounds?.title ?? "회차";
    const [{ count: tables }, { data: retried }] = await Promise.all([
      db().from("dining_tables").select("id", { count: "exact", head: true }).eq("match_run_id", raw.id),
      db().from("status_events").select("id").eq("entity_type", "match_run").eq("entity_id", raw.id).eq("field", "retry").limit(1),
    ]);
    const escalate = async (why: string) => {
      await db().from("exceptions").upsert(
        { kind: "data_missing", ref_type: "match_run", ref_id: raw.id, reason: `${title} 자동 매칭이 멈췄어요. ${why}`, dedupe_key: `match_run:${raw.id}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
      res.escalated++;
    };
    if ((tables ?? 0) > 0) {
      await escalate(`테이블 ${tables}개는 만들어졌어요. '매칭 중'으로 남은 신청을 확인해 주세요 (${raw.summary?.error ?? "원인 미상"})`);
      continue;
    }
    if (retried?.length) {
      await escalate(`한 번 다시 돌렸는데도 실패했어요 (${raw.summary?.error ?? "원인 미상"})`);
      continue;
    }
    // 모임이 이미 지난 회차는 다시 돌리지 않는다 (지난 날짜로 테이블을 만들면 안 된다)
    const first = Math.min(...(raw.rounds?.slots ?? []).map((x) => Date.parse(x.starts_at)));
    if (!Number.isFinite(first) || first <= t.getTime()) {
      await escalate(`모임 날짜가 지나 다시 돌리지 않았어요 (${raw.summary?.error ?? "원인 미상"})`);
      continue;
    }
    await logStatus({ entityType: "match_run", entityId: raw.id, field: "retry", from: raw.status, to: "running", actor: "system", reason: `멈춘 매칭 다시 실행 (${raw.summary?.error ?? "원인 미상"})` });
    await db().from("applications").update({ match_status: "WAITING" }).eq("round_id", raw.round_id).eq("match_status", "MATCHING");
    // 실패 처리 도중 멈춰 안내를 못 받은 사람도 다시 매칭 대상으로 돌린다 (안내가 나간 사람은 그대로)
    const { data: half } = await db().from("applications").select("id").eq("round_id", raw.round_id).eq("match_status", "ALTERNATIVE_OFFERED").is("resolution", null);
    if (half?.length) {
      const { data: told } = await db().from("notifications").select("dedupe_key").in("dedupe_key", half.map((a) => `alternative:${a.id}`));
      const toldSet = new Set((told ?? []).map((x) => x.dedupe_key));
      const back = half.filter((a) => !toldSet.has(`alternative:${a.id}`)).map((a) => a.id);
      if (back.length) await db().from("applications").update({ match_status: "WAITING", payment_status: "PAID" }).in("id", back).eq("match_status", "ALTERNATIVE_OFFERED");
    }
    try {
      const { runRound } = await import("./matching/runner");
      await runRound(raw.round_id, "system", { resumeFailed: true });
      res.retried++;
    } catch (e) {
      await escalate(`다시 돌렸는데도 실패했어요 (${String(e).slice(0, 160)})`);
    }
  }
  return res;
}
