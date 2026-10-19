// 시연용 봇. 심사 시연에서 혼자 신청해도 테이블이 차고, 단체방에서 사람처럼 대화하고, 체크인·후기까지 남긴다.
// 실제 운영 기능이 아니다. settings 'demo.bots'로 끄면 아무것도 하지 않는다 (docs/06-demo-bots.md)
// 봇 = is_demo이면서 login_id가 'test-'로 시작하는 계정 (시연 패널 '테스트 참가자'와 같은 규칙). 시연 참가자 계정(010…)은 사람으로 본다.
import bcrypt from "bcryptjs";
import { OPEN_REGIONS, PASSES } from "../constants";
import { logStatus } from "../events";
import { kstDay } from "../regions";
import { db } from "../supabase";
import { type JoinProfile, botsNeeded, chooseBots, makeBot, nextGender } from "./join";
import { arrivalMinutes, persona } from "./persona";
import { msgKey, phaseOpen, pickNoShow, planReplies, planTable, spreadTimes } from "./plan";
import { type Ctx, categoryWord, reviewFor } from "./scripts";

export const BOTS_KEY = "demo.bots";
const ACTOR = "system:demo-bot";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isBot = (u: { login_id?: string | null; is_demo?: boolean | null } | null | undefined) => Boolean(u?.is_demo) && (u?.login_id ?? "").startsWith("test-");

/** 기본은 켜짐. 운영자가 시연 패널에서 끌 수 있다 */
export async function botsOn(): Promise<boolean> {
  const { data } = await db().from("settings").select("value").eq("key", BOTS_KEY).maybeSingle();
  return (data?.value as { on?: boolean } | null)?.on !== false;
}

type Profile = { job: string | null; mbti: string | null; interests: string[] | null; my_traits: string[] | null; gender: string | null; birth_year: number | null };
type Member = { appId: string; userId: string; attendance: string | null; name: string; bot: boolean; profile: Profile | null };
type Table = { id: string; status: string; start: number; end: number; region: string; venue: string | null; category: string | null; members: Member[] };

/** 봇이 한 명이라도 앉은 테이블 (끝난 지 하루 안까지) */
async function loadTables(t: Date, onlyId?: string): Promise<Table[]> {
  let q = db()
    .from("dining_tables")
    .select("id,status,slots!inner(starts_at,ends_at,region),venues(name,category)")
    .in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY", "IN_PROGRESS", "DONE"])
    .gt("slots.ends_at", new Date(t.getTime() - 25 * 3600_000).toISOString())
    .limit(200);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: tbs } = await q;
  const rows = (tbs ?? []) as unknown as { id: string; status: string; slots: { starts_at: string; ends_at: string; region: string }; venues: { name: string; category: string | null } | null }[];
  if (!rows.length) return [];
  const { data: apps } = await db()
    .from("applications")
    .select("id,user_id,table_id,attendance_status,users(name,login_id,is_demo,profiles(job,mbti,interests,my_traits,gender,birth_year))")
    .in("table_id", rows.map((r) => r.id))
    .eq("match_status", "CONFIRMED");
  const byTable = new Map<string, Member[]>();
  for (const a of (apps ?? []) as unknown as { id: string; user_id: string; table_id: string; attendance_status: string | null; users: { name: string; login_id: string; is_demo: boolean; profiles: Profile | Profile[] | null } }[]) {
    const pr = Array.isArray(a.users.profiles) ? a.users.profiles[0] ?? null : a.users.profiles;
    const list = byTable.get(a.table_id) ?? [];
    list.push({ appId: a.id, userId: a.user_id, attendance: a.attendance_status, name: a.users.name, bot: isBot(a.users), profile: pr });
    byTable.set(a.table_id, list);
  }
  return rows
    .map((r) => ({ id: r.id, status: r.status, start: Date.parse(r.slots.starts_at), end: Date.parse(r.slots.ends_at), region: r.slots.region, venue: r.venues?.name ?? null, category: r.venues?.category ?? null, members: byTable.get(r.id) ?? [] }))
    .filter((x) => x.members.some((m) => m.bot));
}

const personas = (tb: Table) => tb.members.filter((m) => m.bot).map((m) => persona({ id: m.userId, name: m.name }, m.profile));
const ctxOf = (tb: Table, firstHuman?: string): Ctx => {
  const humans = tb.members.filter((m) => !m.bot).map((m) => m.name);
  if (firstHuman) humans.sort((a, b) => (a === firstHuman ? -1 : b === firstHuman ? 1 : 0));
  return { region: tb.region, venue: tb.venue, category: categoryWord(tb.category), startMs: tb.start, humans };
};
const noShowOf = (tb: Table) => pickNoShow(tb.id, tb.members.filter((m) => m.bot).map((m) => m.userId));

type Msg = { id: string; kind: string; sender_id: string | null; body: string; dedupe_key: string | null; created_at: string };
async function roomOf(tableId: string): Promise<{ roomId: string; msgs: Msg[] } | null> {
  const { data: room } = await db().from("chat_rooms").select("id").eq("table_id", tableId).maybeSingle();
  if (!room) return null;
  const { data } = await db().from("chat_messages").select("id,kind,sender_id,body,dedupe_key,created_at").eq("room_id", room.id).order("created_at");
  return { roomId: room.id, msgs: (data ?? []) as Msg[] };
}

async function insert(roomId: string, rows: { userId: string; body: string; key: string; at?: number }[]): Promise<number> {
  if (!rows.length) return 0;
  const { data } = await db()
    .from("chat_messages")
    .upsert(
      rows.map((r) => ({ room_id: roomId, sender_id: r.userId, kind: "user", body: r.body, dedupe_key: r.key, ...(r.at ? { created_at: new Date(r.at).toISOString() } : {}) })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  return data?.length ?? 0;
}

/** 대화 주제 메시지(content:<테이블>)에서 번호 붙은 주제만 꺼낸다 */
export function parseTopics(body: string): string[] {
  return body.split("\n").map((l) => l.match(/^\d+\.\s*(.+)$/)?.[1]).filter((x): x is string => Boolean(x));
}

/**
 * 모임 시각이 된 봇 체크인 (앱 체크인과 같은 상태값·기록). 한 테이블에서 한 명까지는 일부러 오지 않는다(노쇼 시연).
 * tick이 모임 종료 처리(노쇼 후보 올리기)보다 먼저 부른다.
 */
export async function botArrivals(t: Date): Promise<number> {
  if (!(await botsOn())) return 0;
  let n = 0;
  for (const tb of await loadTables(t)) {
    if (tb.status === "DONE") continue;
    const noShow = noShowOf(tb);
    for (const m of tb.members.filter((x) => x.bot && x.attendance === "SCHEDULED" && x.userId !== noShow)) {
      const at = tb.start + arrivalMinutes(persona({ id: m.userId, name: m.name }, m.profile)) * 60_000;
      // 시계를 끝난 뒤로 바로 옮겨도(아직 종료 처리 전) 도착 시각대로 체크인한다
      if (at > t.getTime()) continue;
      const { data: up } = await db().from("applications").update({ attendance_status: "ATTENDED", checked_in_at: new Date(at).toISOString() }).eq("id", m.appId).eq("attendance_status", "SCHEDULED").select("id");
      if (up?.length) {
        await logStatus({ entityType: "application", entityId: m.appId, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: ACTOR, reason: "앱 체크인 (시연 봇)" });
        n++;
      }
    }
  }
  return n;
}

/** 사람 메시지 가운데 아직 봇이 답하지 않은 것 (3시간 안). 시스템의 '늦을 것 같대요'도 그 사람 말로 본다 */
function pendingHuman(tb: Table, msgs: Msg[], realNow: number) {
  const humans = new Map(tb.members.filter((m) => !m.bot).map((m) => [m.userId, m.name]));
  const answered = new Set(msgs.map((m) => m.dedupe_key?.match(/:reply:([^:]+)$/)?.[1]).filter(Boolean));
  return msgs
    .filter((m) => realNow - Date.parse(m.created_at) < 3 * 3600_000 && !answered.has(m.id))
    .map((m) => {
      if (m.kind === "user" && m.sender_id && humans.has(m.sender_id)) return { msg: m, author: humans.get(m.sender_id)!, text: m.body };
      const late = m.kind === "system" ? m.body.match(/^(.+)님이 조금 늦을 것 같대요/) : null;
      if (late && [...humans.values()].includes(late[1])) return { msg: m, author: late[1], text: "조금 늦을 것 같아요" };
      return null;
    })
    .filter((x): x is { msg: Msg; author: string; text: string } => Boolean(x));
}

/** 이 테이블에서 지금 대답할 수 있는 봇 (시작 뒤엔 안 온 사람 빼고) */
const repliers = (tb: Table, demoNow: number) => {
  const noShow = demoNow >= tb.start ? noShowOf(tb) : null;
  return personas(tb).filter((p) => p.userId !== noShow);
};

/**
 * 사람이 단체방에 쓴 직후(after) 부른다. 사람처럼 몇 초 뒤에 한두 명이 답한다. 봇 말에는 답하지 않는다(무한 대화 방지).
 */
export async function botReplies(tableId: string, opts: { live?: boolean } = {}): Promise<number> {
  if (!(await botsOn())) return 0;
  const { now } = await import("../clock");
  const t = await now();
  const [tb] = await loadTables(t, tableId);
  if (!tb || tb.status === "DONE" || t.getTime() >= tb.end) return 0;
  const room = await roomOf(tb.id);
  if (!room) return 0;
  let n = 0;
  const used = new Set(room.msgs.map((m) => m.body));
  for (const h of pendingHuman(tb, room.msgs, Date.now())) {
    const plan = planReplies(h.msg.id, h.text, repliers(tb, t.getTime()), ctxOf(tb, h.author), used);
    for (const [k, r] of plan.entries()) {
      const key = msgKey(tb.id, r.userId, "reply", h.msg.id);
      if (opts.live) {
        // 화면 응답 뒤라 기다려도 된다. 너무 길면 서버 시간 제한에 걸리니 짧게
        await sleep(k === 0 ? 2500 : 2000);
        n += await insert(room.roomId, [{ userId: r.userId, body: r.body, key }]);
      } else {
        const at = Math.min(Date.now() - (plan.length - k) * 1000, Date.parse(h.msg.created_at) + r.delayMs);
        n += await insert(room.roomId, [{ userId: r.userId, body: r.body, key, at: Math.max(at, Date.parse(h.msg.created_at) + 1000) }]);
      }
    }
  }
  return n;
}

/** 한 테이블에서 지금 올릴 차례가 된 봇 대화(인사·하루 전·도착·주제·끝인사)를 올린다 */
async function scheduled(tb: Table, t: Date): Promise<number> {
  const room = await roomOf(tb.id);
  if (!room) return 0; // 단체방이 아직 없으면 조용히 건너뛴다
  const realNow = Date.now();
  const offset = t.getTime() - realNow; // 시연 시계 - 실제 시각
  const keys = new Set(room.msgs.map((m) => m.dedupe_key));
  const notice = room.msgs.find((m) => m.dedupe_key === `notice:${tb.id}`);
  const content = room.msgs.find((m) => m.dedupe_key === `content:${tb.id}`);
  const plan = planTable({
    tableId: tb.id,
    bots: personas(tb),
    ctx: ctxOf(tb),
    startMs: tb.start,
    endMs: tb.end,
    noticeAt: notice ? Date.parse(notice.created_at) : null,
    topics: content ? parseTopics(content.body) : null,
    noShow: noShowOf(tb),
  });
  const due = plan
    .filter((m) => !keys.has(m.key) && phaseOpen(m.phase, t.getTime(), tb.start, tb.end))
    .map((m) => ({ ...m, real: m.phase === "hello" ? m.due : m.due - offset }))
    .filter((m) => m.real <= realNow)
    .sort((a, b) => a.real - b.real);
  if (!due.length) return 0;
  const last = room.msgs.length ? Date.parse(room.msgs[room.msgs.length - 1].created_at) : realNow - 60_000;
  const at = spreadTimes(due.map((m) => m.real), last, realNow);
  return insert(room.roomId, due.map((m, k) => ({ userId: m.userId, body: m.body, key: m.key, at: at[k] })));
}

/** tick마다: 일정에 맞춘 봇 대화, 놓친 답장, 끝난 모임 후기 */
export async function botTick(t: Date): Promise<string[]> {
  if (!(await botsOn())) return [];
  let said = 0;
  let replied = 0;
  let reviewed = 0;
  for (const tb of await loadTables(t)) {
    said += await scheduled(tb, t);
    // after()가 실패했거나 서버가 끊겨 못 한 답장
    if (tb.status !== "DONE" && t.getTime() < tb.end) replied += await botReplies(tb.id);
    if (t.getTime() >= tb.end) reviewed += await botReviews(tb);
  }
  const out: string[] = [];
  if (said) out.push(`시연 봇 대화 ${said}건`);
  if (replied) out.push(`시연 봇 답장 ${replied}건`);
  if (reviewed) out.push(`시연 봇 후기 ${reviewed}건`);
  return out;
}

const pulsedAt = new Map<string, number>();
/**
 * 단체방을 보고 있는 동안(새 메시지 확인 요청마다) 그 방만 가볍게 돌린다. 같은 서버에서 10초에 한 번까지.
 * tick(최소 2분 간격)만 기다리면 인사가 한꺼번에 몰려 보여서, 보는 동안 한 마디씩 올라오게 한다.
 */
export async function botPulse(tableId: string): Promise<number> {
  const last = pulsedAt.get(tableId) ?? 0;
  if (Date.now() - last < 10_000) return 0;
  pulsedAt.set(tableId, Date.now());
  if (!(await botsOn())) return 0;
  const { now } = await import("../clock");
  const t = await now();
  const [tb] = await loadTables(t, tableId);
  if (!tb) return 0;
  return scheduled(tb, t);
}

/** 끝난 모임에서 체크인한 봇이 후기를 남긴다 (참가자 후기와 같은 테이블·기록). 사람에게는 가끔 '또 만나고 싶어요' */
async function botReviews(tb: Table): Promise<number> {
  const bots = tb.members.filter((m) => m.bot && m.attendance === "ATTENDED");
  if (!bots.length) return 0;
  const { data: done } = await db().from("feedbacks").select("application_id").in("application_id", bots.map((b) => b.appId));
  const has = new Set((done ?? []).map((d) => d.application_id));
  let n = 0;
  for (const b of bots.filter((x) => !has.has(x.appId))) {
    const p = persona({ id: b.userId, name: b.name }, b.profile);
    const r = reviewFor(p, tb.id);
    const { error } = await db().from("feedbacks").insert({ application_id: b.appId, user_id: b.userId, table_id: tb.id, mood_score: r.mood, talk_score: r.talk, venue_score: r.venue, rejoin_intent: r.rejoin, recommend_intent: r.recommend, comment: r.comment });
    if (error) continue; // 이미 있으면(동시에 돈 경우) 넘어간다
    if (r.again) {
      for (const h of tb.members.filter((m) => !m.bot)) await db().from("person_prefs").upsert({ from_user: b.userId, to_user: h.userId, table_id: tb.id, pref: "again" });
    }
    await logStatus({ entityType: "application", entityId: b.appId, field: "feedback", to: "SUBMITTED", actor: ACTOR, reason: "후기 제출 (시연 봇)" });
    n++;
  }
  return n;
}

/**
 * 사람(봇이 아닌 참가자)이 결제를 마치면 같은 일정(첫 번째로 고른 날짜·동네)에 봇을 같이 신청시킨다. 최소 인원(4명)까지만.
 * 아직 이 회차에 신청하지 않은 봇을 먼저 쓰고, 모자라면 새로 만든다(시연 패널 '테스트 참가자 만들기'와 같은 모양).
 */
export async function botsJoin(appId: string): Promise<number> {
  if (!(await botsOn())) return 0;
  const { data: raw } = await db()
    .from("applications")
    .select("id,user_id,round_id,payment_status,application_status,users(login_id,is_demo,profiles(birth_year,gender,interests,price_range)),rounds(status),application_slots(slots(id,region,starts_at))")
    .eq("id", appId)
    .maybeSingle();
  const app = raw as unknown as {
    id: string; user_id: string; round_id: string; payment_status: string; application_status: string;
    users: { login_id: string; is_demo: boolean; profiles: JoinProfile | JoinProfile[] | null };
    rounds: { status: string } | null;
    application_slots: { slots: { id: string; region: string; starts_at: string } | null }[];
  } | null;
  if (!app || isBot(app.users) || app.payment_status !== "PAID" || app.application_status === "CANCELED" || app.rounds?.status !== "open") return 0;
  const me = Array.isArray(app.users.profiles) ? app.users.profiles[0] : app.users.profiles;
  if (!me) return 0;
  const slots = app.application_slots.map((x) => x.slots).filter((s): s is NonNullable<typeof s> => Boolean(s)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const slot = slots.find((s) => OPEN_REGIONS.includes(s.region)) ?? slots[0];
  if (!slot) return 0;

  // 이 일정에 이미 결제하고 기다리는 사람 중 나이가 가까운 사람
  const { data: there } = await db()
    .from("application_slots")
    .select("applications!inner(id,user_id,round_id,payment_status,application_status,match_status,users(profiles(birth_year,gender)),application_slots(slot_id))")
    .eq("slot_id", slot.id);
  type Prof = { birth_year: number; gender: "M" | "F" };
  type There = { applications: { id: string; user_id: string; payment_status: string; application_status: string; match_status: string; users: { profiles: Prof | Prof[] | null }; application_slots: { slot_id: string }[] } };
  const others = ((there ?? []) as unknown as There[])
    .map((x) => x.applications)
    .filter((a) => a.user_id !== app.user_id && a.payment_status === "PAID" && a.application_status !== "CANCELED" && a.match_status === "WAITING")
    .map((a) => ({ p: (Array.isArray(a.users.profiles) ? a.users.profiles[0] : a.users.profiles) as Prof | null, slots: a.application_slots.length }))
    .filter((o): o is { p: Prof; slots: number } => Boolean(o.p))
    .map((o) => ({ birth_year: o.p.birth_year, gender: o.p.gender, slots: o.slots }));
  const need = botsNeeded(me.birth_year, others);
  if (!need) return 0;
  const genders: ("M" | "F")[] = [me.gender, ...others.filter((o) => o.slots === 1).map((o) => o.gender)];

  // 이 회차에 아직 신청하지 않은 봇
  const { data: pool } = await db().from("users").select("id,login_id,is_demo,profiles(birth_year,gender,interests,price_range),applications(round_id)").like("login_id", "test-%").eq("is_demo", true).limit(500);
  const cands = ((pool ?? []) as unknown as { id: string; login_id: string; is_demo: boolean; profiles: JoinProfile | JoinProfile[] | null; applications: { round_id: string }[] }[])
    .filter((u) => !u.applications.some((a) => a.round_id === app.round_id))
    .map((u) => ({ userId: u.id, profile: (Array.isArray(u.profiles) ? u.profiles[0] : u.profiles) as JoinProfile }))
    .filter((c) => Boolean(c.profile));
  const picked = chooseBots(me, cands, need, genders, app.id);
  const ids = picked.map((c) => c.userId);
  for (const c of picked) genders.push(c.profile.gender);

  // 모자라면 새로 만든다
  const lack = need - ids.length;
  if (lack > 0) {
    const hash = await bcrypt.hash("demo1234", 8);
    const stamp = Date.now().toString(36).slice(-5);
    const made = Array.from({ length: lack }, (_, k) => {
      const g = nextGender(genders);
      genders.push(g);
      return { k, bot: makeBot(me, g, `${app.id}:${k}`) };
    });
    const { data: users } = await db()
      .from("users")
      .insert(made.map((m) => ({ login_id: `test-bot-${stamp}-${m.k + 1}`, password_hash: hash, name: m.bot.name, role: "user", is_demo: true })))
      .select("id,login_id");
    const idOf = new Map((users ?? []).map((u) => [u.login_id, u.id]));
    const rows = made.map((m) => ({ id: idOf.get(`test-bot-${stamp}-${m.k + 1}`), m })).filter((x): x is { id: string; m: (typeof made)[number] } => Boolean(x.id));
    if (rows.length) {
      await db().from("profiles").insert(rows.map(({ id, m }) => ({ user_id: id, ...m.bot.profile, agreed_at: new Date().toISOString() })));
      ids.push(...rows.map((r) => r.id));
    }
  }
  if (!ids.length) return 0;

  // 1회권 결제 완료로 신청 (시연 패널 테스트 참가자와 같은 모양)
  const expires = new Date(Date.now() + 60 * 86400_000).toISOString();
  const { data: passes } = await db().from("passes").insert(ids.map((id) => ({ user_id: id, pass_type: "single", total_count: PASSES.single.count, remaining: Math.max(0, PASSES.single.count - 1), expires_at: expires }))).select("id,user_id");
  const passOf = new Map((passes ?? []).map((x) => [x.user_id, x.id]));
  const paidAt = new Date().toISOString();
  const { data: pays } = await db().from("payments").insert(ids.map((id) => ({ user_id: id, pass_id: passOf.get(id), amount: PASSES.single.amount, pass_type: "single", status: "PAID", paid_at: paidAt }))).select("id,user_id");
  const payOf = new Map((pays ?? []).map((x) => [x.user_id, x.id]));
  const { data: apps } = await db()
    .from("applications")
    .insert(ids.map((id) => ({ user_id: id, round_id: app.round_id, payment_id: payOf.get(id), application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", submitted_at: paidAt, areas: [slot.region], dates: [kstDay(slot.starts_at)], near_ok: false })))
    .select("id");
  await db().from("application_slots").insert((apps ?? []).map((a) => ({ application_id: a.id, slot_id: slot.id })));
  for (const a of apps ?? []) await logStatus({ entityType: "application", entityId: a.id, field: "application_status", from: "DRAFT", to: "SUBMITTED", actor: ACTOR, reason: `시연 봇이 같은 일정에 함께 신청 (${slot.region})` });
  return apps?.length ?? 0;
}

