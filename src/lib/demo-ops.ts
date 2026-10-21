// 시연 패널과 심사 투어가 같이 쓰는 시연 동작. 서버 액션이 아니라서 화면에서 바로 부를 수 없다(부르는 쪽이 운영자 권한을 확인한다)
import { now, realNowIso } from "./clock";
import { OPEN_REGIONS } from "./constants";
import { logStatus } from "./events";
import { notify } from "./notify";
import { tick } from "./pipeline";
import { sidoOf } from "./regions";
import { db } from "./supabase";
import { loadTemplates, render } from "./templates";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 시계를 회차의 한 시점(deadline·dayBefore·start·end·reset)으로 옮기고 그 시각에 할 일을 바로 처리한다. 시각을 못 찾으면 null */
export async function moveClockTo(to: string, roundId: string): Promise<string[] | null> {
  let target: Date | null = null;
  if (to === "reset") target = new Date();
  else {
    const { data: round } = await db().from("rounds").select("match_at,slots(starts_at,ends_at)").eq("id", roundId).maybeSingle();
    if (!round) return null;
    const slots = ((round as unknown as { slots: { starts_at: string; ends_at: string }[] }).slots ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (to === "deadline") target = new Date(new Date(round.match_at).getTime() + 60_000);
    if (to === "dayBefore" && slots[0]) target = new Date(new Date(slots[0].starts_at).getTime() - 23 * 3600_000);
    if (to === "start" && slots[0]) target = new Date(new Date(slots[0].starts_at).getTime() + 5 * 60_000);
    if (to === "end" && slots.length) target = new Date(Math.max(...slots.map((s) => new Date(s.ends_at).getTime())) + 60_000);
  }
  if (!target) return null;
  // 시계는 뒤로 돌리지 않는다(이미 지난 시각이면 그대로 두고 밀린 일만 처리). 처음으로 되돌리기(reset)만 예외
  const cur = await now();
  if (to !== "reset" && target.getTime() > cur.getTime()) {
    await db().from("app_clock").update({ offset_seconds: Math.round((target.getTime() - Date.now()) / 1000) }).eq("id", 1);
  }
  if (to === "reset") await db().from("app_clock").update({ offset_seconds: 0 }).eq("id", 1);
  return tick();
}

/** 테스트 참가자 체크인과 후기를 채운다. 일부는 서로 '다시는 싫어요'(25%) 또는 '또 만나고 싶어요'를 고른다. 실제 사람 계정은 건드리지 않는다 */
export async function fillAttendance(roundId: string): Promise<number> {
  const { data: apps } = await db()
    .from("applications")
    .select("id,user_id,table_id,attendance_status,users(login_id)")
    .eq("round_id", roundId)
    .eq("match_status", "CONFIRMED");
  const list = (apps ?? []) as unknown as { id: string; user_id: string; table_id: string; attendance_status: string; users: { login_id: string } }[];
  const r = rng(42);
  const tpl = await loadTemplates();
  const at = (await now()).toISOString(); // 앱 체크인과 같은 시연용 시계
  let n = 0;
  for (const a of list) {
    if (!a.users.login_id.startsWith("test-")) continue;
    if (a.attendance_status === "SCHEDULED") {
      await db().from("applications").update({ attendance_status: "ATTENDED", checked_in_at: at }).eq("id", a.id);
      await logStatus({ entityType: "application", entityId: a.id, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: "admin:demo", reason: "시연용 자동 체크인" });
      // 모임이 이미 끝나 노쇼 후보로 올라갔다면 함께 정리한다
      await db().from("exceptions").update({ status: "resolved", resolution: "시연용 체크인으로 참석 처리", resolved_at: realNowIso() }).eq("dedupe_key", `noshow:${a.id}`);
    }
    await db().from("feedbacks").upsert({
      application_id: a.id, user_id: a.user_id, table_id: a.table_id,
      mood_score: 3 + Math.floor(r() * 3), talk_score: 3 + Math.floor(r() * 3), venue_score: 3 + Math.floor(r() * 3),
      rejoin_intent: 3 + Math.floor(r() * 3), recommend_intent: 3 + Math.floor(r() * 3),
    });
    await notify({ userId: a.user_id, template: "feedback", ...render("feedback", {}, tpl), link: `/tables/${a.table_id}/feedback`, dedupeKey: `feedback:${a.id}` });
    const mates = list.filter((m) => m.table_id === a.table_id && m.user_id !== a.user_id);
    if (mates.length && r() < 0.25) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "avoid" });
    } else if (mates.length && r() < 0.3) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "again" });
    }
    n++;
  }
  return n;
}

/** 서울 날짜(YYYY-MM-DD)에 days를 더한 날짜 */
export function kstDatePlus(t: Date, days: number): string {
  return new Date(t.getTime() + 9 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
}

/**
 * 심사 투어용 회차를 만든다: 시연 시계 기준 하루 뒤 마감, 사흘·나흘 뒤 저녁 7시 30분 모임, 서울 4곳.
 * 식당 재고는 일정마다 배정이 켜진 식당 2테이블씩. 지우는 데이터는 없다
 */
export async function createTourRound(adminId: string, base?: Date, label = "심사 시연"): Promise<string | null> {
  const t = base ?? (await now());
  const dates = [kstDatePlus(t, 3), kstDatePlus(t, 4)];
  const deadline = new Date(t.getTime() + 24 * 3600_000).toISOString();
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const title = `${label} ${md(dates[0])}·${md(dates[1]).replace(/^\d+월 /, "")}`;
  const { data: round } = await db().from("rounds").insert({ title, apply_deadline: deadline, match_at: deadline }).select("id").single();
  if (!round) return null;
  const rows = dates.flatMap((d) =>
    OPEN_REGIONS.map((region) => {
      const start = new Date(`${d}T19:30:00+09:00`).toISOString();
      return { round_id: round.id, region, sido: sidoOf(region) ?? null, starts_at: start, ends_at: new Date(Date.parse(start) + 150 * 60_000).toISOString(), max_tables: 4 };
    }),
  );
  const { data: slots } = await db().from("slots").insert(rows).select("id,region");
  const { data: venues } = await db().from("venues").select("id,region").eq("active", true);
  const vs = (slots ?? []).flatMap((s) => (venues ?? []).filter((v) => v.region === s.region).map((v) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (vs.length) await db().from("venue_slots").insert(vs);
  await logStatus({ entityType: "round", entityId: round.id, field: "status", from: null, to: "open", actor: `admin:${adminId}`, reason: `심사 투어 회차 만들기: ${title} · 일정 ${rows.length}개 · 식당 재고 ${vs.length}칸` });
  return round.id;
}
