"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { now, realNowIso } from "@/lib/clock";
import { INTERESTS, MBTIS, OPEN_REGIONS, PASSES, PRICE_RANGES, TRAITS, isMembership } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { notify } from "@/lib/notify";
import { tick } from "@/lib/pipeline";
import { adminBackUrl, fillNeeds, isDemoHuman, roundAccepting } from "@/lib/demo-panel";
import { passExpiresAt } from "@/lib/pass-expiry";
import { loadRelations } from "@/lib/matching/runner";
import { pairKey } from "@/lib/matching/types";
import { kstDay } from "@/lib/regions";
import { AGE_NEAR } from "@/lib/sim/join";
import { loadTemplates, render } from "@/lib/templates";
import { db } from "@/lib/supabase";

const FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];
const GIVEN = ["민준", "서연", "도윤", "지우", "하준", "서윤", "시우", "하은", "지호", "수아", "준서", "지민", "현우", "예린", "건우", "채원", "우진", "다인", "선우", "소율"];
const JOBS = ["마케터", "개발자", "디자이너", "간호사", "대학원생", "회계사", "기획자", "교사", "PD", "연구원", "공무원", "바리스타"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Pass = keyof typeof PASSES;
// 시연 참가자 중 멤버십 비율(약 25%)과 1·3·6개월 나눔은 PRD에 없는 시연용 가정이다. 가격은 운영사 Q&A 값(constants.ts PASSES)
const MEMBERSHIP_SHARE = 0.25;
function pickPass(x: number, y: number): Pass {
  if (x >= MEMBERSHIP_SHARE) return "single";
  return y < 0.5 ? "m1" : y < 0.8 ? "m3" : "m6";
}
/** payments.ts와 같은 규칙: 멤버십은 산 날부터 N개월(횟수 없음), 1회권은 이번 신청에 바로 1회를 쓴다(유효 60일). t는 시연용 시계 */
function passRow(userId: string, type: Pass, t: Date) {
  const d = PASSES[type];
  return { user_id: userId, pass_type: type, total_count: d.count, remaining: Math.max(0, d.count - 1), expires_at: passExpiresAt(d.months, t).toISOString() };
}

/** 패널 동작 뒤 대시보드로. 보던 회차(r)와 패널 펼침을 지킨다. 폼에 r이 없으면 round_id를 쓴다 */
function back(msg: string, form?: FormData | null): never {
  revalidatePath("/admin");
  const r = form ? String(form.get("r") ?? form.get("round_id") ?? "") : "";
  redirect(adminBackUrl(msg, { r: r || null, demo: true }));
}

/** 테스트 참가자를 만들고 결제 완료 상태로 신청까지 시킨다 */
export async function seedParticipants(form: FormData) {
  await requireAdminWrite();
  const roundId = String(form.get("round_id"));
  const n = Math.min(60, Math.max(4, Number(form.get("count") ?? 36)));
  // 마감이 지났거나 매칭이 시작된 회차에 결제 완료 신청을 넣으면 매칭 대상이 못 돼 '결제 완료'와 '확정' 숫자가 어긋난다
  const { data: rd } = await db().from("rounds").select("status,apply_deadline").eq("id", roundId).maybeSingle();
  if (!roundAccepting(rd, await now())) back("신청 마감이 지났거나 매칭이 시작된 회차예요. 모집 중인 회차를 고르거나 ④ 다음 회차로 넘어가 주세요", form);
  // 시연 신청은 운영 지역 4곳(홍대·잠실·강남·을지로) 일정에만 넣는다
  const { data: allSlots } = await db().from("slots").select("id,region,starts_at").eq("round_id", roundId).order("starts_at");
  const slots = (allSlots ?? []).filter((s) => OPEN_REGIONS.includes(s.region));
  if (!slots.length) back("운영 지역(홍대·잠실·강남·을지로) 일정이 없는 회차예요", form);
  const t = await now(); // 결제·신청 시각은 시연용 시계로 적는다
  const at = t.toISOString();
  const r = rng(Date.now());
  const pick = <T,>(arr: readonly T[], k: number) => [...arr].sort(() => r() - 0.5).slice(0, k);
  const hash = await bcrypt.hash("demo1234", 10);
  const stamp = Date.now().toString(36).slice(-4);

  // 일부러 넣는 예외 상황: 앞의 두 동네 금요일에 몰리고, 나머지는 적게, 나이 차가 큰 사람 둘.
  // 약 25%는 멤버십으로 결제해 둔다. 실패하기 쉬운 사람(홍대에 혼자 몰린 첫 사람, 나이 차가 큰 마지막 사람)은 꼭 멤버십으로 넣어 기한 연장이 보이게 한다
  const busy = [...new Set(slots.map((s) => s.region))].slice(0, 2); // 앞의 두 동네에 몰리게
  const main = slots.filter((s) => busy.includes(s.region));
  const thin = slots.filter((s) => s.region === "홍대·합정·연남").slice(0, 1);

  // 한 번에 넣어야 서버 시간 제한 안에 끝난다 (참가자 수와 상관없이 쿼리 6번)
  const people = Array.from({ length: n }, (_, i) => {
    const outlier = i >= n - 2;
    return {
      i,
      gender: r() < 0.5 ? "M" : "F",
      name: `${FAMILY[Math.floor(r() * FAMILY.length)]}${GIVEN[Math.floor(r() * GIVEN.length)]}`,
      birth: outlier ? 1982 : 1994 + Math.floor(r() * 8),
      slots: i < 3 ? thin : outlier ? pick(slots, 1) : pick(main.length ? main : slots, 1 + Math.floor(r() * 2)),
      pass: (i === 0 ? "m1" : i === n - 1 ? "m3" : pickPass(r(), r())) as Pass,
    };
  });
  const { data: users } = await db()
    .from("users")
    .insert(people.map((p) => ({ login_id: `test-${stamp}-${p.i + 1}`, password_hash: hash, name: p.name, role: "user", is_demo: true })))
    .select("id,login_id");
  const idOf = new Map((users ?? []).map((u) => [u.login_id, u.id]));
  const uid = (i: number) => idOf.get(`test-${stamp}-${i + 1}`)!;

  await db().from("profiles").insert(
    people.map((p) => ({
      user_id: uid(p.i),
      birth_year: p.birth,
      gender: p.gender,
      job: JOBS[Math.floor(r() * JOBS.length)],
      mbti: r() < 0.9 ? MBTIS[Math.floor(r() * MBTIS.length)] : null,
      interests: pick(INTERESTS, 3),
      my_traits: pick(TRAITS, 2),
      wanted_traits: pick(TRAITS, 1),
      price_range: PRICE_RANGES[Math.floor(r() * 3)],
      agreed_at: new Date().toISOString(),
    })),
  );
  const { data: passes } = await db()
    .from("passes")
    .insert(people.map((p) => passRow(uid(p.i), p.pass, t)))
    .select("id,user_id");
  const passOf = new Map((passes ?? []).map((x) => [x.user_id, x.id]));
  const { data: pays } = await db()
    .from("payments")
    .insert(people.map((p) => ({ user_id: uid(p.i), pass_id: passOf.get(uid(p.i)), amount: PASSES[p.pass].amount, pass_type: p.pass, status: "PAID", paid_at: at })))
    .select("id,user_id");
  const payOf = new Map((pays ?? []).map((x) => [x.user_id, x.id]));
  const { data: apps } = await db()
    .from("applications")
    .insert(
      people.map((p) => ({
        user_id: uid(p.i),
        round_id: roundId,
        payment_id: payOf.get(uid(p.i)),
        application_status: "SUBMITTED",
        payment_status: "PAID",
        match_status: "WAITING",
        submitted_at: at,
        // 고른 동네·날짜와 '가까운 동네도 괜찮아요'(열에 한 명꼴로 끔)
        areas: [...new Set(p.slots.map((s) => s.region))],
        dates: [...new Set(p.slots.map((s) => kstDay(s.starts_at)))],
        near_ok: r() >= 0.1,
      })),
    )
    .select("id,user_id");
  const appOf = new Map((apps ?? []).map((x) => [x.user_id, x.id]));
  await db().from("application_slots").insert(people.flatMap((p) => p.slots.map((s) => ({ application_id: appOf.get(uid(p.i)), slot_id: s.id }))));
  const created = apps?.length ?? 0;
  const members = people.filter((p) => isMembership(p.pass)).length;
  back(`테스트 참가자 ${created}명을 결제 완료 상태로 신청시켰어요 (멤버십 ${members}명, 1회권 ${created - members}명)`, form);
}

/** 시연용 가상 시각 이동. 이동 뒤 바로 시간 이벤트를 처리한다 */
export async function moveClock(form: FormData) {
  await requireAdminWrite();
  const to = String(form.get("to"));
  const roundId = String(form.get("round_id") ?? "");
  let target: Date | null = null;

  if (to === "reset") target = new Date();
  else {
    const { data: round } = await db().from("rounds").select("match_at,slots(starts_at,ends_at)").eq("id", roundId).single();
    const slots = ((round as unknown as { slots: { starts_at: string; ends_at: string }[] })?.slots ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (to === "deadline") target = new Date(new Date(round!.match_at).getTime() + 60_000);
    if (to === "dayBefore" && slots[0]) target = new Date(new Date(slots[0].starts_at).getTime() - 23 * 3600_000);
    if (to === "start" && slots[0]) target = new Date(new Date(slots[0].starts_at).getTime() + 5 * 60_000);
    if (to === "end") target = new Date(Math.max(...slots.map((s) => new Date(s.ends_at).getTime())) + 60_000);
  }
  if (!target) back("이동할 시각을 찾지 못했어요", form);
  const offset = Math.round((target!.getTime() - Date.now()) / 1000);
  await db().from("app_clock").update({ offset_seconds: to === "reset" ? 0 : offset }).eq("id", 1);
  const done = await tick();
  back(done.length ? `시각을 옮기고 처리했어요: ${done.join(", ")}` : "시각을 옮겼어요", form);
}

/** 테스트 참가자 체크인과 후기를 자동으로 채운다. 일부는 서로 '다시는 싫어요'를 고른다 */
export async function autoAttend(form: FormData) {
  await requireAdminWrite();
  const roundId = String(form.get("round_id"));
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
    if (!a.users.login_id.startsWith("test-")) continue; // 실제 사람 계정은 건드리지 않는다
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
    // 실제 참가자(김우연 등)는 직접 남기도록 후기 요청 알림만 간다
    await notify({ userId: a.user_id, template: "feedback", ...render("feedback", {}, tpl), link: `/tables/${a.table_id}/feedback`, dedupeKey: `feedback:${a.id}` });
    const mates = list.filter((m) => m.table_id === a.table_id && m.user_id !== a.user_id);
    if (mates.length && r() < 0.25) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "avoid" });
    } else if (mates.length && r() < 0.3) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "again" });
    }
    n++;
  }
  back(`테스트 참가자 ${n}명의 체크인과 후기를 채웠어요`, form);
}

type Slot = { id: string; region: string; starts_at: string };

/** 결제 완료(이용권)로 다음 차수에 신청을 넣는다. 실제 신청 화면과 같은 규칙: 기간이 남은 멤버십이면 0원, 아니면 1회권을 새로 산다 */
async function applyPaid(userId: string, roundId: string, chosen: Slot[], t: Date, nearOk: boolean): Promise<boolean> {
  const at = t.toISOString();
  const { data: owned } = await db().from("passes").select("id,pass_type,expires_at").eq("user_id", userId).in("pass_type", ["m1", "m3", "m6"]).gt("expires_at", at).order("expires_at", { ascending: false }).limit(1).maybeSingle();
  let payRow: Record<string, unknown>;
  if (owned) payRow = { user_id: userId, amount: 0, pass_type: owned.pass_type, pass_id: owned.id, status: "PAID", provider: "pass", paid_at: at };
  else {
    const { data: np } = await db().from("passes").insert(passRow(userId, "single", t)).select("id").single();
    payRow = { user_id: userId, amount: PASSES.single.amount, pass_type: "single", pass_id: np?.id ?? null, status: "PAID", paid_at: at };
  }
  const { data: pay } = await db().from("payments").insert(payRow).select("id").single();
  if (!pay) return false;
  const { data: app } = await db()
    .from("applications")
    .insert({ user_id: userId, round_id: roundId, payment_id: pay.id, application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", submitted_at: at, areas: [...new Set(chosen.map((s) => s.region))], dates: [...new Set(chosen.map((s) => kstDay(s.starts_at)))], near_ok: nearOk })
    .select("id")
    .single();
  if (!app) return false;
  await db().from("application_slots").insert(chosen.map((s) => ({ application_id: app.id, slot_id: s.id })));
  return true;
}

/**
 * 이 차수 참석자들을 다음 차수에 다시 신청시킨다. 이전 만남과 비선호가 반영되는지 보려고.
 * 테스트 참가자뿐 아니라 시연 참가자(사람, 010…)도 넣고, 4명이 안 되는 일정은 테스트 참가자로 채운다
 */
export async function reapply(form: FormData) {
  await requireAdminWrite();
  const from = String(form.get("round_id"));
  const to = String(form.get("next_round_id"));
  const t = await now();
  const { data: next } = await db().from("rounds").select("title,status").eq("id", to).maybeSingle();
  if (!next || next.status !== "open") back("다음 회차가 이미 마감됐어요. 새 회차를 먼저 만들어 주세요", form);
  const { data: apps } = await db().from("applications").select("user_id,users(login_id,is_demo,profiles(birth_year))").eq("round_id", from).eq("attendance_status", "ATTENDED");
  const { data: allSlots } = await db().from("slots").select("id,region,starts_at").eq("round_id", to).order("starts_at");
  const slots = (allSlots ?? []).filter((s) => OPEN_REGIONS.includes(s.region));
  if (!slots.length) back("다음 회차에 운영 지역(홍대·잠실·강남·을지로) 일정이 없어요", form);
  const two = [...new Set(slots.map((s) => s.region))].slice(0, 2);
  const pool = slots.filter((s) => two.includes(s.region));
  const r = rng(7);
  type Prev = { user_id: string; users: { login_id: string; is_demo: boolean; profiles: { birth_year: number } | { birth_year: number }[] | null } };
  const birthOf = (u: Prev["users"]) => (Array.isArray(u.profiles) ? u.profiles[0] : u.profiles)?.birth_year ?? null;
  let n = 0;
  let humans = 0;
  // 사람은 한 일정만 고르게 해서(가장 이른 일정) 그 일정을 4명까지 채운다
  const humanSlot = pool[0];
  const humanAt: { slot: string; userId: string; birth: number | null }[] = [];
  for (const a of (apps ?? []) as unknown as Prev[]) {
    if (!a.users?.is_demo) continue; // 실제 회원은 건드리지 않는다
    const { data: exists } = await db().from("applications").select("id").eq("user_id", a.user_id).eq("round_id", to).maybeSingle();
    if (exists) continue;
    const human = isDemoHuman(a.users);
    const chosen = human ? [humanSlot] : [...pool].sort(() => r() - 0.5).slice(0, 2);
    if (!(await applyPaid(a.user_id, to, chosen, t, true))) continue;
    n++;
    if (human) {
      humans++;
      humanAt.push({ slot: humanSlot.id, userId: a.user_id, birth: birthOf(a.users) });
    }
  }

  // 4명이 안 되는 일정 채우기: 이 차수에 아직 신청하지 않은 테스트 참가자를 쓰고, 모자라면 새로 만든다
  const { data: nowApps } = await db().from("applications").select("user_id,payment_status,application_status,application_slots(slot_id)").eq("round_id", to);
  const live = ((nowApps ?? []) as unknown as { user_id: string; payment_status: string; application_status: string; application_slots: { slot_id: string }[] }[]).filter((a) => a.payment_status === "PAID" && a.application_status !== "CANCELED");
  const needs = fillNeeds(live.map((a) => ({ slots: a.application_slots.map((x) => x.slot_id).filter((id) => pool.some((s) => s.id === id)) })));
  let filled = 0;
  let filledSlots = 0;
  if (needs.size) {
    const taken = new Set(live.map((a) => a.user_id));
    const { data: testers } = await db().from("users").select("id,login_id,is_demo,profiles(birth_year)").like("login_id", "test-%").eq("is_demo", true).limit(800);
    const cands = ((testers ?? []) as unknown as { id: string; profiles: { birth_year: number } | { birth_year: number }[] | null }[])
      .map((u) => ({ id: u.id, birth: (Array.isArray(u.profiles) ? u.profiles[0] : u.profiles)?.birth_year ?? null }))
      .filter((u) => u.birth !== null && !taken.has(u.id));
    const rel = await loadRelations([...humanAt.map((h) => h.userId), ...cands.map((c) => c.id)]);
    for (const s of pool) {
      const need = needs.get(s.id) ?? 0;
      if (!need) continue;
      // 사람이 있는 일정이면 그 사람과 나이가 가깝고, 다시는 싫다·차단·신고 관계가 아닌 사람만
      const here = humanAt.filter((h) => h.slot === s.id);
      const fit = cands.filter((c) => !taken.has(c.id) && here.every((h) => (h.birth === null || Math.abs(c.birth! - h.birth) <= AGE_NEAR) && !rel.excluded.has(pairKey(h.userId, c.id))));
      const pick = fit.slice(0, need).map((c) => c.id);
      if (pick.length < need) pick.push(...(await makeTestUsers(need - pick.length, here[0]?.birth ?? null)));
      for (const id of pick) {
        taken.add(id);
        if (await applyPaid(id, to, [s], t, false)) filled++;
      }
      if (pick.length) filledSlots++;
    }
  }
  const who = humans ? ` (시연 참가자 ${humans}명 포함)` : "";
  back(`${n}명${who}을 ${next!.title}에 다시 신청시켰어요${filled ? ` · 4명이 안 되는 일정 ${filledSlots}곳에 테스트 참가자 ${filled}명을 채웠어요` : ""}`, form);
}

/** 테스트 참가자 계정을 새로 만든다(프로필까지). near가 있으면 그 나이 ±2살로 */
async function makeTestUsers(k: number, near: number | null): Promise<string[]> {
  if (k <= 0) return [];
  const r = rng(Date.now());
  const hash = await bcrypt.hash("demo1234", 8);
  const stamp = Date.now().toString(36).slice(-4);
  const rows = Array.from({ length: k }, (_, i) => ({ login: `test-${stamp}-f${i + 1}`, name: `${FAMILY[Math.floor(r() * FAMILY.length)]}${GIVEN[Math.floor(r() * GIVEN.length)]}`, gender: i % 2 ? "F" : "M", birth: near ? near - 2 + Math.floor(r() * 5) : 1994 + Math.floor(r() * 8) }));
  const { data: users } = await db().from("users").insert(rows.map((x) => ({ login_id: x.login, password_hash: hash, name: x.name, role: "user", is_demo: true }))).select("id,login_id");
  const idOf = new Map((users ?? []).map((u) => [u.login_id, u.id as string]));
  const pick = <T,>(arr: readonly T[], n: number) => [...arr].sort(() => r() - 0.5).slice(0, n);
  const made = rows.filter((x) => idOf.has(x.login));
  await db().from("profiles").insert(
    made.map((x) => ({ user_id: idOf.get(x.login), birth_year: x.birth, gender: x.gender, job: JOBS[Math.floor(r() * JOBS.length)], mbti: MBTIS[Math.floor(r() * MBTIS.length)], interests: pick(INTERESTS, 3), my_traits: pick(TRAITS, 2), wanted_traits: pick(TRAITS, 1), price_range: PRICE_RANGES[1], agreed_at: new Date().toISOString() })),
  );
  return made.map((x) => idOf.get(x.login)!);
}

/** 이 차수의 시연 데이터를 지우고 처음 상태로 되돌린다 */
export async function resetRound(form: FormData) {
  await requireAdminWrite();
  const roundId = String(form.get("round_id"));
  const { data: tables } = await db().from("dining_tables").select("id").eq("round_id", roundId);
  const tableIds = (tables ?? []).map((t) => t.id);
  const { data: apps } = await db().from("applications").select("id").eq("round_id", roundId);
  const appIds = (apps ?? []).map((a) => a.id);

  if (tableIds.length) {
    await db().from("feedbacks").delete().in("table_id", tableIds);
    await db().from("applications").update({ table_id: null }).in("table_id", tableIds);
    await db().from("exceptions").delete().in("ref_id", tableIds);
    await db().from("dining_tables").delete().in("id", tableIds);
  }
  if (appIds.length) {
    await db().from("exceptions").delete().in("ref_id", appIds);
    await db().from("applications").update({ transferred_from: null }).in("transferred_from", appIds);
    await db().from("applications").delete().in("id", appIds);
  }
  const { data: runs } = await db().from("match_runs").select("id").eq("round_id", roundId);
  const runIds = (runs ?? []).map((x) => x.id);
  if (runIds.length) {
    // 상태 기록이 매칭 실행을 가리키고 있어서 먼저 끊어야 지워진다
    await db().from("status_events").update({ match_run_id: null }).in("match_run_id", runIds);
    await db().from("match_runs").delete().in("id", runIds);
  }
  await db().from("rounds").update({ status: "open" }).eq("id", roundId);
  await db().from("app_clock").update({ offset_seconds: 0 }).eq("id", 1);

  // 신청이 하나도 남지 않은 테스트 계정 정리
  const { data: tests } = await db().from("users").select("id,applications(id)").like("login_id", "test-%");
  const orphan = (tests ?? []).filter((u) => !(u as unknown as { applications: unknown[] }).applications?.length).map((u) => u.id);
  if (orphan.length) await db().from("users").delete().in("id", orphan);
  back("이 회차를 처음 상태로 되돌렸어요", form);
}

/** 시연 봇 켜기·끄기 (settings demo.bots). 끄면 봇이 같이 신청·대화·체크인·후기를 하지 않는다 */
export async function toggleBots(form: FormData) {
  const me = await requireAdminWrite();
  const on = form.get("on") === "1";
  const { BOTS_KEY, botsOn } = await import("@/lib/sim/bots");
  const was = await botsOn();
  await db().from("settings").upsert({ key: BOTS_KEY, value: { on } }, { onConflict: "key" });
  if (was !== on) await logStatus({ entityType: "setting", entityId: me.id, field: BOTS_KEY, from: was ? "on" : "off", to: on ? "on" : "off", actor: `admin:${me.id}`, reason: on ? "시연 봇 켜기" : "시연 봇 끄기" });
  back(on ? "시연 봇을 켰어요" : "시연 봇을 껐어요", form);
}

/**
 * 예전 시연 메시지 문구 다듬기: 받침에 안 맞게 나간 '이에요/예요'를 고친다(단체방·알림함).
 * 조사 함수가 들어가기 전에 쌓인 시연 데이터 정리용. 고친 건수를 이력에 남긴다. 여러 번 눌러도 결과가 같다
 */
export async function fixOldCopula(form: FormData) {
  const me = await requireAdminWrite();
  const { fixCopula } = await import("@/lib/korean");
  let fixed = 0;
  for (const table of ["chat_messages", "notifications"] as const) {
    const { data } = await db().from(table).select("id,body").or("body.like.%이에요%,body.like.%예요%").limit(5000);
    const changed = (data ?? []).map((r) => ({ id: r.id as string, body: fixCopula(String(r.body)) })).filter((r, i) => r.body !== (data ?? [])[i].body);
    for (const r of changed) {
      const { error } = await db().from(table).update({ body: r.body }).eq("id", r.id);
      if (!error) fixed++;
    }
  }
  if (fixed) await logStatus({ entityType: "setting", entityId: me.id, field: "demo.copula_fix", from: null, to: String(fixed), actor: `admin:${me.id}`, reason: `예전 시연 메시지의 '이에요/예요' ${fixed}건 고침` });
  back(fixed ? `예전 메시지 ${fixed}건의 '이에요/예요'를 받침에 맞게 고쳤어요` : "고칠 메시지가 없어요", form);
}

/** 지금 시각 기준으로 밀린 작업(마감 매칭, 알림, 단체방 게시)을 바로 처리한다 */
export async function runTick(form: FormData) {
  await requireAdminWrite();
  const done = await tick();
  back(done.length ? `처리했어요: ${done.join(", ")}` : "지금 처리할 일이 없어요", form);
}
