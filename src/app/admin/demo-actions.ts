"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { INTERESTS, MBTIS, PRICE_RANGES, TRAITS } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { tick } from "@/lib/pipeline";
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

function back(msg: string) {
  revalidatePath("/admin");
  redirect(`/admin?m=${encodeURIComponent(msg)}`);
}

/** 테스트 참가자를 만들고 결제 완료 상태로 신청까지 시킨다 */
export async function seedParticipants(form: FormData) {
  await requireAdmin();
  const roundId = String(form.get("round_id"));
  const n = Math.min(60, Math.max(4, Number(form.get("count") ?? 36)));
  const { data: slots } = await db().from("slots").select("id,region,starts_at").eq("round_id", roundId).order("starts_at");
  if (!slots?.length) back("일정이 없는 회차예요");
  const r = rng(Date.now());
  const pick = <T,>(arr: readonly T[], k: number) => [...arr].sort(() => r() - 0.5).slice(0, k);
  const hash = await bcrypt.hash("demo1234", 10);
  const stamp = Date.now().toString(36).slice(-4);

  // 일부러 넣는 예외 상황: 성수 금요일에 몰리고, 홍대는 적게, 나이 차가 큰 사람 둘
  const main = slots!.filter((s) => s.region === "성수" || s.region === "강남");
  const thin = slots!.filter((s) => s.region === "홍대").slice(0, 1);

  // 한 번에 넣어야 서버 시간 제한 안에 끝난다 (참가자 수와 상관없이 쿼리 6번)
  const people = Array.from({ length: n }, (_, i) => {
    const outlier = i >= n - 2;
    return {
      i,
      gender: r() < 0.5 ? "M" : "F",
      name: `${FAMILY[Math.floor(r() * FAMILY.length)]}${GIVEN[Math.floor(r() * GIVEN.length)]}`,
      birth: outlier ? 1982 : 1994 + Math.floor(r() * 8),
      slots: i < 3 ? thin : outlier ? pick(slots!, 1) : pick(main.length ? main : slots!, 1 + Math.floor(r() * 2)),
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
    .insert(people.map((p) => ({ user_id: uid(p.i), pass_type: "single", total_count: 1, remaining: 0 })))
    .select("id,user_id");
  const passOf = new Map((passes ?? []).map((x) => [x.user_id, x.id]));
  const { data: pays } = await db()
    .from("payments")
    .insert(people.map((p) => ({ user_id: uid(p.i), pass_id: passOf.get(uid(p.i)), amount: 29000, pass_type: "single", status: "PAID", paid_at: new Date().toISOString() })))
    .select("id,user_id");
  const payOf = new Map((pays ?? []).map((x) => [x.user_id, x.id]));
  const { data: apps } = await db()
    .from("applications")
    .insert(people.map((p) => ({ user_id: uid(p.i), round_id: roundId, payment_id: payOf.get(uid(p.i)), application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", submitted_at: new Date().toISOString() })))
    .select("id,user_id");
  const appOf = new Map((apps ?? []).map((x) => [x.user_id, x.id]));
  await db().from("application_slots").insert(people.flatMap((p) => p.slots.map((s) => ({ application_id: appOf.get(uid(p.i)), slot_id: s.id }))));
  const created = apps?.length ?? 0;
  back(`테스트 참가자 ${created}명을 결제 완료 상태로 신청시켰어요`);
}

/** 시연용 가상 시각 이동. 이동 뒤 바로 시간 이벤트를 처리한다 */
export async function moveClock(form: FormData) {
  await requireAdmin();
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
  if (!target) back("이동할 시각을 찾지 못했어요");
  const offset = Math.round((target!.getTime() - Date.now()) / 1000);
  await db().from("app_clock").update({ offset_seconds: to === "reset" ? 0 : offset }).eq("id", 1);
  const done = await tick();
  back(done.length ? `시각을 옮기고 처리했어요: ${done.join(", ")}` : "시각을 옮겼어요");
}

/** 테스트 참가자 체크인과 후기를 자동으로 채운다. 일부는 서로 '다시는 싫어요'를 고른다 */
export async function autoAttend(form: FormData) {
  await requireAdmin();
  const roundId = String(form.get("round_id"));
  const { data: apps } = await db()
    .from("applications")
    .select("id,user_id,table_id,attendance_status,users(login_id)")
    .eq("round_id", roundId)
    .eq("match_status", "CONFIRMED");
  const list = (apps ?? []) as unknown as { id: string; user_id: string; table_id: string; attendance_status: string; users: { login_id: string } }[];
  const r = rng(42);
  let n = 0;
  for (const a of list) {
    if (!a.users.login_id.startsWith("test-")) continue; // 실제 사람 계정은 건드리지 않는다
    if (a.attendance_status === "SCHEDULED") {
      await db().from("applications").update({ attendance_status: "ATTENDED" }).eq("id", a.id);
      await logStatus({ entityType: "application", entityId: a.id, field: "attendance_status", from: "SCHEDULED", to: "ATTENDED", actor: "admin:demo", reason: "시연용 자동 체크인" });
    }
    await db().from("feedbacks").upsert({
      application_id: a.id, user_id: a.user_id, table_id: a.table_id,
      mood_score: 3 + Math.floor(r() * 3), talk_score: 3 + Math.floor(r() * 3), venue_score: 3 + Math.floor(r() * 3),
      rejoin_intent: 3 + Math.floor(r() * 3), recommend_intent: 3 + Math.floor(r() * 3),
    });
    const mates = list.filter((m) => m.table_id === a.table_id && m.user_id !== a.user_id);
    if (mates.length && r() < 0.25) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "avoid" });
    } else if (mates.length && r() < 0.3) {
      await db().from("person_prefs").upsert({ from_user: a.user_id, to_user: mates[0].user_id, table_id: a.table_id, pref: "again" });
    }
    n++;
  }
  back(`테스트 참가자 ${n}명의 체크인과 후기를 채웠어요`);
}

/** 이 차수 참가자들을 다음 차수에 다시 신청시킨다. 이전 만남과 비선호가 반영되는지 보려고 */
export async function reapply(form: FormData) {
  await requireAdmin();
  const from = String(form.get("round_id"));
  const to = String(form.get("next_round_id"));
  const { data: apps } = await db().from("applications").select("user_id,users(login_id)").eq("round_id", from).eq("attendance_status", "ATTENDED");
  const { data: slots } = await db().from("slots").select("id,region").eq("round_id", to);
  const r = rng(7);
  let n = 0;
  for (const a of (apps ?? []) as unknown as { user_id: string; users: { login_id: string } }[]) {
    if (!a.users.login_id.startsWith("test-")) continue;
    const { data: exists } = await db().from("applications").select("id").eq("user_id", a.user_id).eq("round_id", to).maybeSingle();
    if (exists) continue;
    const { data: pay } = await db().from("payments").insert({ user_id: a.user_id, amount: 29000, pass_type: "single", status: "PAID", paid_at: new Date().toISOString() }).select("id").single();
    const { data: app } = await db()
      .from("applications")
      .insert({ user_id: a.user_id, round_id: to, payment_id: pay!.id, application_status: "SUBMITTED", payment_status: "PAID", match_status: "WAITING", submitted_at: new Date().toISOString() })
      .select("id")
      .single();
    const chosen = (slots ?? []).filter((s) => s.region === "성수" || s.region === "강남").sort(() => r() - 0.5).slice(0, 2);
    await db().from("application_slots").insert(chosen.map((s) => ({ application_id: app!.id, slot_id: s.id })));
    n++;
  }
  back(`${n}명을 다음 차수에 다시 신청시켰어요`);
}

/** 이 차수의 시연 데이터를 지우고 처음 상태로 되돌린다 */
export async function resetRound(form: FormData) {
  await requireAdmin();
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
  await db().from("match_runs").delete().eq("round_id", roundId);
  await db().from("rounds").update({ status: "open" }).eq("id", roundId);
  await db().from("app_clock").update({ offset_seconds: 0 }).eq("id", 1);

  // 신청이 하나도 남지 않은 테스트 계정 정리
  const { data: tests } = await db().from("users").select("id,applications(id)").like("login_id", "test-%");
  const orphan = (tests ?? []).filter((u) => !(u as unknown as { applications: unknown[] }).applications?.length).map((u) => u.id);
  if (orphan.length) await db().from("users").delete().in("id", orphan);
  back("이 회차를 처음 상태로 되돌렸어요");
}

/** 지금 시각 기준으로 밀린 작업(마감 매칭, 알림, 단체방 게시)을 바로 처리한다 */
export async function runTick() {
  await requireAdmin();
  const done = await tick();
  back(done.length ? `처리했어요: ${done.join(", ")}` : "지금 처리할 일이 없어요");
}
