import { now } from "./clock";
import { REFUND_POLICY } from "./constants";
import { logStatus } from "./events";
import { fmtDate, fmtTime } from "./format";
import { notify } from "./notify";
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
    .select("id,user_id,attendance_status,users(name,profiles(job,interests,mbti))")
    .eq("table_id", tableId)
    .eq("match_status", "CONFIRMED");
  return (data ?? []) as unknown as {
    id: string;
    user_id: string;
    attendance_status: string | null;
    users: { name: string; profiles: { job: string | null; interests: string[]; mbti: string | null } | null };
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

/** 식당 자동 배정 (INF-02). 같은 지역·일정에서 남은 자리가 있는 식당을 고른다 */
export async function assignVenue(tableId: string): Promise<boolean> {
  const t = await loadTable(tableId);
  if (t.venue_id) return true;
  const { data: options } = await db()
    .from("venue_slots")
    .select("venue_id,tables_available,venues(id,name,active,region)")
    .eq("slot_id", t.slot_id);
  const { data: used } = await db().from("dining_tables").select("venue_id").eq("slot_id", t.slot_id).not("venue_id", "is", null);
  const usedCount = new Map<string, number>();
  for (const u of used ?? []) usedCount.set(u.venue_id, (usedCount.get(u.venue_id) ?? 0) + 1);

  const pick = (options ?? [])
    .map((o) => o as unknown as { venue_id: string; tables_available: number; venues: { active: boolean; region: string } })
    .filter((o) => o.venues?.active && o.venues.region === t.slots.region)
    .filter((o) => (usedCount.get(o.venue_id) ?? 0) < o.tables_available)
    .sort((a, b) => (usedCount.get(a.venue_id) ?? 0) - (usedCount.get(b.venue_id) ?? 0))[0];

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
  for (const m of ms) {
    await notify({
      userId: m.user_id,
      template: "reminder",
      title: "내일 저녁 약속 잊지 마세요",
      body: `${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)} ${t.slots.region}. ${t.reservation_name ? `예약명은 '${t.reservation_name}'이에요. ` : ""}당일 취소는 할 수 없어요.`,
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

  const { data: all } = await db().from("conversation_contents").select("id,kind,tags,body").eq("active", true);
  const topics = (all ?? []).filter((c) => c.kind === "topic");
  const tagged = common.flatMap((tag) => topics.filter((t) => (t.tags ?? []).includes(tag)));
  const general = topics.filter((t) => !(t.tags ?? []).length);
  const chosen = [...new Map([...tagged, ...general].map((t) => [t.id, t])).values()].slice(0, 3);
  const ice = (all ?? []).filter((c) => c.kind === "icebreaker");
  const icebreaker = ice.length ? ice[tableId.charCodeAt(0) % ice.length] : null;
  return { topics: chosen, icebreaker, common: common.slice(0, 3) };
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
  const { data: pending } = await db().from("notifications").select("id,attempts").eq("status", "pending").lte("scheduled_at", iso).limit(200);
  for (const n of pending ?? []) {
    const { error } = await db().from("notifications").update({ status: "sent", sent_at: iso }).eq("id", n.id).eq("status", "pending");
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
  if (pending?.length) done.push(`예약 알림 ${pending.length}건 발송`);

  // 3. 테이블 일정에 따른 단체방 게시와 상태 전환
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
        `내일 ${fmtTime(tb.slots.starts_at)}, ${tb.slots.region}에서 만나요.${tb.reservation_name ? ` 예약명은 '${tb.reservation_name}'이에요.` : ""}\n당일 취소와 단체방 나가기는 할 수 없어요. 늦을 것 같으면 이 방에 미리 알려 주세요.`,
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
          c.icebreaker ? `\n아이스브레이킹: ${c.icebreaker.body}` : "",
        ].join("\n"),
        `content:${tb.id}`,
        { type: "content", common: c.common },
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
            await notify({
              userId: m.user_id,
              template: "feedback",
              title: "오늘 저녁 어떠셨어요?",
              body: "1분이면 끝나요. 남겨 주신 후기는 다음 매칭에 반영돼요.",
              link: `/tables/${tb.id}/feedback`,
              dedupeKey: `feedback:${m.id}`,
            });
          }
        }
      }
    }
  }
  return done;
}
