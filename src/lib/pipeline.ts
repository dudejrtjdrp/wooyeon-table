import { now } from "./clock";
import { REFUND_POLICY } from "./constants";
import { logStatus } from "./events";
import { fmtDate, fmtTime } from "./format";
import { notify } from "./notify";
import { pushNotifications } from "./push";
import { loadContentRules, rank, tableTypes } from "./contents";
import { loadTemplates, render } from "./templates";
import { GOOD_RATING } from "./reservations";
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
    .select("id,user_id,attendance_status,users(name,profiles(job,interests,mbti,birth_year))")
    .eq("table_id", tableId)
    .eq("match_status", "CONFIRMED");
  return (data ?? []) as unknown as {
    id: string;
    user_id: string;
    attendance_status: string | null;
    users: { name: string; profiles: { job: string | null; interests: string[]; mbti: string | null; birth_year: number } | null };
  }[];
}

async function systemMessage(roomId: string, body: string, dedupeKey: string, meta: Record<string, unknown> = {}) {
  await db()
    .from("chat_messages")
    .upsert({ room_id: roomId, kind: "system", body, meta, dedupe_key: dedupeKey }, { onConflict: "dedupe_key", ignoreDuplicates: true });
}

export async function ensureRoom(tableId: string): Promise<string> {
  await db().from("chat_rooms").upsert({ table_id: tableId }, { onConflict: "table_id", ignoreDuplicates: true });
  const { data } = await db().from("chat_rooms").select("id").eq("table_id", tableId).single();
  return data!.id;
}

/**
 * 식당 자동 배정 (INF-02). 같은 지역·일정에서 남은 자리가 있고, 테이블 인원이 앉을 수 있고, 예약 채널이 있는 식당.
 * 평점 4.3 이상을 먼저, 그다음 평점 높은 순, 같으면 덜 쓴 식당 (운영사 Q&A: 평점 좋고 예약 가능한 곳)
 */
export async function assignVenue(tableId: string): Promise<boolean> {
  const t = await loadTable(tableId);
  if (t.venue_id) return true;
  const { data: options } = await db()
    .from("venue_slots")
    .select("venue_id,tables_available,venues(id,name,active,region,rating,booking_channel,seats_per_table)")
    .eq("slot_id", t.slot_id);
  const { count: party } = await db().from("applications").select("id", { count: "exact", head: true }).eq("table_id", tableId).eq("match_status", "CONFIRMED");
  const { data: used } = await db().from("dining_tables").select("venue_id").eq("slot_id", t.slot_id).not("venue_id", "is", null);
  const usedCount = new Map<string, number>();
  for (const u of used ?? []) usedCount.set(u.venue_id, (usedCount.get(u.venue_id) ?? 0) + 1);

  const pick = (options ?? [])
    .map((o) => o as unknown as { venue_id: string; tables_available: number; venues: { active: boolean; region: string; rating: number | null; booking_channel: string | null; seats_per_table: number } })
    .filter((o) => o.venues?.active && o.venues.region === t.slots.region)
    .filter((o) => (usedCount.get(o.venue_id) ?? 0) < o.tables_available)
    .filter((o) => (o.venues.seats_per_table ?? 6) >= (party ?? 0))
    .sort((a, b) => {
      const good = (x: typeof a) => Number((x.venues.rating ?? 0) >= GOOD_RATING) + Number(Boolean(x.venues.booking_channel));
      return good(b) - good(a) || (b.venues.rating ?? 0) - (a.venues.rating ?? 0) || (usedCount.get(a.venue_id) ?? 0) - (usedCount.get(b.venue_id) ?? 0);
    })[0];

  if (!pick) {
    await db().from("exceptions").upsert(
      { kind: "venue_shortage", ref_type: "dining_table", ref_id: tableId, reason: `${t.slots.region} ${fmtDate(t.slots.starts_at)}에 배정할 수 있는 식당이 없어요`, dedupe_key: `venue:${tableId}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    return false;
  }

  const reservation = `우연한식탁 ${tableId.slice(0, 4).toUpperCase()}`;
  // venue_id가 비어 있을 때만 채운다 (두 번 실행돼도 한 번만 배정)
  const { data: updated } = await db()
    .from("dining_tables")
    .update({ venue_id: pick.venue_id, reservation_name: reservation, status: "VENUE_ASSIGNED" })
    .eq("id", tableId)
    .is("venue_id", null)
    .select("id");
  if (updated?.length) {
    await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", from: t.status, to: "VENUE_ASSIGNED", actor: "system", reason: "식당 자동 배정" });
  }
  // 이어서 식당 예약 요청 (네이버 예약·캐치테이블 어댑터, 실패하면 재시도 후 예외)
  const { requestReservation } = await import("./reservations");
  await requestReservation(tableId);
  return true;
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
      `${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)}, ${t.slots.region}에서 만나요.`,
      venueLine,
      "",
      `오늘 함께할 분들이에요.\n${intro}`,
      reasons ? `\n이렇게 모였어요: ${reasons}` : "",
      "",
      `취소 규정\n${REFUND_POLICY.slice(0, 3).map((r) => `· ${r}`).join("\n")}`,
    ]
      .filter((x) => x !== undefined)
      .join("\n"),
    `notice:${tableId}`,
    { type: "notice" },
  );

  if (hasVenue) {
    const { data: updated } = await db().from("dining_tables").update({ status: "READY" }).eq("id", tableId).eq("status", "VENUE_ASSIGNED").select("id");
    if (updated?.length) {
      await logStatus({ entityType: "dining_table", entityId: tableId, field: "status", from: "VENUE_ASSIGNED", to: "READY", actor: "system", reason: "단체방 개설과 첫 공지 완료" });
    }
  }

  // 하루 전 리마인드 예약 (INF-07). 시각이 되면 tick이 발송 처리한다
  const remindAt = new Date(new Date(t.slots.starts_at).getTime() - 24 * 60 * 60 * 1000);
  const tpl = await loadTemplates();
  const rm = render("reminder", { date: fmtDate(t.slots.starts_at), time: fmtTime(t.slots.starts_at), region: t.slots.region, reservation: t.reservation_name ?? "식당 안내 참고" }, tpl);
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

/** 테이블 공통 관심사와 성향으로 대화 주제 3개 + 아이스브레이킹 1개를 고른다 (CON-01, CON-02) */
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
    ms.map((m) => ({ birthYear: m.users.profiles?.birth_year ?? 1995, pastAttended: pastCount.get(m.user_id) ?? 0 })),
    new Date(t.slots.starts_at).getFullYear(),
  );

  const [{ data: all }, rules] = await Promise.all([
    db().from("conversation_contents").select("id,kind,tags,table_types,priority,body").eq("active", true),
    loadContentRules(),
  ]);
  const topics = rank(all ?? [], "topic", common, types, rules, tableId).slice(0, rules.topicCount);
  const icebreakers = rank(all ?? [], "icebreaker", common, types, rules, tableId).slice(0, rules.icebreakerCount);
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

  // 1. 마감 시각이 지난 차수 자동 매칭 (MAT-01)
  const { data: due } = await db().from("rounds").select("id,title").eq("status", "open").lte("match_at", iso);
  if (due?.length) {
    const { runRound } = await import("./matching/runner");
    for (const r of due) {
      await runRound(r.id);
      done.push(`${r.title} 자동 매칭`);
    }
  }

  // 2. 예약된 알림 발송 (INF-07, INF-08)
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
    if (key.startsWith("feedback-remind:")) {
      const { data: f } = await db().from("feedbacks").select("application_id").eq("application_id", key.split(":")[1]).maybeSingle();
      if (f) {
        await db().from("notifications").delete().eq("id", n.id);
        continue;
      }
    }
    const { data: up, error } = await db().from("notifications").update({ status: "sent", sent_at: iso }).eq("id", n.id).eq("status", "pending").select("id");
    if (up?.length) sentNow.push(n.id);
    if (error) {
      const attempts = (n.attempts ?? 0) + 1;
      await db().from("notifications").update({ attempts, last_error: error.message, status: attempts >= 3 ? "failed" : "pending" }).eq("id", n.id);
      if (attempts >= 3) {
        await db().from("exceptions").upsert(
          { kind: "notification", ref_type: "notification", ref_id: n.id, reason: "알림을 세 번 보내지 못했어요", dedupe_key: `notify:${n.id}` },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
      }
    }
  }
  await pushNotifications(sentNow).catch(() => null);
  if (pending?.length) done.push(`예약 알림 ${pending.length}건 발송`);

  // 2-1. 빈자리 제안 응답 기한이 지난 건은 다음 대기자에게 넘긴다 (STA-07)
  const { expireOffers } = await import("./attendance");
  const expired = await expireOffers();
  if (expired) done.push(`빈자리 제안 ${expired}건 기한 만료, 다음 대기자 확인`);

  // 식당 예약 재시도 (3번 실패하면 예외 큐)
  const { retryReservations } = await import("./reservations");
  const retried = await retryReservations();
  if (retried) done.push(`식당 예약 재시도 ${retried}건`);

  // 매칭 실패 뒤: 하루 전 다시 알림, 3일 무응답·기다리기 마감이면 이용권 보관
  const { autoResolve } = await import("./resolve");
  const ar = await autoResolve();
  if (ar.reminded) done.push(`실패 안내 다시 알림 ${ar.reminded}건`);
  if (ar.kept) done.push(`3일 무응답 이용권 보관 ${ar.kept}건`);
  if (ar.waitOver) done.push(`기다리기 마감 이용권 보관 ${ar.waitOver}건`);

  // 3. 테이블 일정에 따른 단체방 게시와 상태 전환
  const tpl = await loadTemplates();
  const { data: tables } = await db()
    .from("dining_tables")
    .select("id,status,reservation_name,slots(starts_at,ends_at,region)")
    .in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY", "IN_PROGRESS"]);
  for (const raw of tables ?? []) {
    const tb = raw as unknown as { id: string; status: string; reservation_name: string | null; slots: { starts_at: string; ends_at: string; region: string } };
    const start = new Date(tb.slots.starts_at);
    const end = new Date(tb.slots.ends_at);
    const roomId = await ensureRoom(tb.id);

    if (t.getTime() >= start.getTime() - 24 * 60 * 60 * 1000) {
      await systemMessage(
        roomId,
        render("reminder_chat", { time: fmtTime(tb.slots.starts_at), region: tb.slots.region, reservation: tb.reservation_name ?? "식당 안내 참고" }, tpl).body,
        `remind:${tb.id}`,
        { type: "reminder" },
      );
    }

    if (t >= start && tb.status !== "IN_PROGRESS") {
      const c = await pickContents(tb.id);
      await systemMessage(
        roomId,
        [
          "모두 모이셨나요? 오늘의 대화 주제예요.",
          ...c.topics.map((x, i) => `${i + 1}. ${x.body}`),
          c.icebreakers.length ? `\n아이스브레이킹\n${c.icebreakers.map((x) => `· ${x.body}`).join("\n")}` : "",
        ].join("\n"),
        `content:${tb.id}`,
        { type: "content", common: c.common, types: c.types },
      );
      const { data: up } = await db().from("dining_tables").update({ status: "IN_PROGRESS" }).eq("id", tb.id).in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY"]).select("id");
      if (up?.length) await logStatus({ entityType: "dining_table", entityId: tb.id, field: "status", from: tb.status, to: "IN_PROGRESS", actor: "system", reason: "모임 시작 시각" });
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
            const fb = render("feedback", {}, tpl);
            await notify({
              userId: m.user_id,
              template: "feedback",
              title: fb.title,
              body: fb.body,
              link: `/tables/${tb.id}/feedback`,
              dedupeKey: `feedback:${m.id}`,
            });
            // 하루 뒤에도 후기가 없으면 한 번만 더 알린다. 다음 신청을 막지는 않는다
            await notify({
              userId: m.user_id,
              template: "feedback_remind",
              ...render("feedback_remind", {}, tpl),
              link: `/tables/${tb.id}/feedback`,
              dedupeKey: `feedback-remind:${m.id}`,
              scheduledAt: new Date(t.getTime() + 24 * 3600_000),
            });
          }
        }
      }
    }
  }
  // 4. 모집 중인 회차를 지난 참가자에게 추천 (새 일정 소식 받기에 동의한 사람만)
  const recommended = await recommendOpenRounds(t);
  if (recommended) done.push(`다음 일정 추천 ${recommended}건`);
  return done;
}

const DAYS = "일월화수목금토";
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).getUTCDay();

async function recommendOpenRounds(t: Date) {
  const { data: rounds } = await db().from("rounds").select("id,title,apply_deadline,slots(region,starts_at)").eq("status", "open").gt("apply_deadline", t.toISOString());
  if (!rounds?.length) return 0;
  const { data: past } = await db()
    .from("applications")
    .select("user_id,dining_tables(slots(region,starts_at)),users(profiles(marketing_opt_in))")
    .eq("attendance_status", "ATTENDED");
  const lastByUser = new Map<string, { region: string; starts_at: string }>();
  for (const p of (past ?? []) as unknown as { user_id: string; dining_tables: { slots: { region: string; starts_at: string } } | null; users: { profiles: { marketing_opt_in: boolean } | { marketing_opt_in: boolean }[] | null } }[]) {
    const prof = Array.isArray(p.users?.profiles) ? p.users.profiles[0] : p.users?.profiles;
    const s = p.dining_tables?.slots;
    if (!s || !prof?.marketing_opt_in) continue;
    const cur = lastByUser.get(p.user_id);
    if (!cur || cur.starts_at < s.starts_at) lastByUser.set(p.user_id, s);
  }
  let sent = 0;
  for (const r of rounds) {
    const { data: applied } = await db().from("applications").select("user_id").eq("round_id", r.id);
    const has = new Set((applied ?? []).map((a) => a.user_id));
    for (const [uid, last] of lastByUser) {
      if (has.has(uid)) continue;
      const same = (r.slots ?? []).find((s) => s.region === last.region && kstDay(s.starts_at) === kstDay(last.starts_at));
      const region = (r.slots ?? []).some((s) => s.region === last.region);
      const body = same
        ? `지난번처럼 ${DAYS[kstDay(same.starts_at)]}요일 ${same.region} 일정이 열렸어요. ${r.title}, 이번에도 어때요?`
        : region
          ? `${last.region}에서 새 식탁이 열렸어요. ${r.title} 일정을 확인해 보세요.`
          : `${r.title} 모집을 시작했어요. 새로운 사람들과 한 번 더 앉아 볼까요?`;
      await notify({ userId: uid, template: "next_round", title: "다음 식탁이 열렸어요", body, link: `/apply/${r.id}`, dedupeKey: `next-round:${r.id}:${uid}` });
      sent++;
    }
  }
  return sent;
}
