import { logStatus } from "../events";
import { fmtDate, fmtTime } from "../format";
import { afterConfirm } from "../pipeline";
import { pushNotifications } from "../push";
import { loadTemplates, render } from "../templates";
import { db } from "../supabase";
import { runMatching } from "./engine";
import {
  ALGORITHM_VERSION,
  type Candidate,
  DEFAULT_SETTINGS,
  type MatchSettings,
  type Relations,
  type Slot,
  pairKey,
} from "./types";

type AppRow = {
  id: string;
  user_id: string;
  payment_status: string;
  users: { account_status: string; profiles: ProfileRow | ProfileRow[] | null };
  application_slots: { slot_id: string }[];
};
type ProfileRow = {
  birth_year: number;
  gender: "M" | "F";
  mbti: string | null;
  interests: string[];
  my_traits: string[];
  wanted_traits: string[];
};

export async function loadSettings(): Promise<MatchSettings> {
  const { data } = await db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    ...DEFAULT_SETTINGS,
    weights: { ...DEFAULT_SETTINGS.weights, ...(map.get("matching.weights") ?? {}) },
    minScore: Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore),
  };
}

export async function loadRelations(userIds: string[]): Promise<Relations> {
  const rel: Relations = { excluded: new Set(), met: new Set(), again: new Set() };
  if (!userIds.length) return rel;
  const [blocks, reports, prefs, enc] = await Promise.all([
    db().from("blocks").select("blocker_id,blocked_id").in("blocker_id", userIds),
    db().from("safety_reports").select("reporter_id,reported_id").in("reporter_id", userIds),
    db().from("person_prefs").select("from_user,to_user,pref").in("from_user", userIds),
    db().from("encounters").select("user_id,met_user_id").in("user_id", userIds),
  ]);
  for (const b of blocks.data ?? []) rel.excluded.add(pairKey(b.blocker_id, b.blocked_id));
  // 신고가 접수되면 처리 결과와 상관없이 두 사람을 분리한다 (PRD 15장)
  for (const r of reports.data ?? []) rel.excluded.add(pairKey(r.reporter_id, r.reported_id));
  for (const p of prefs.data ?? []) {
    if (p.pref === "avoid") rel.excluded.add(pairKey(p.from_user, p.to_user));
    else rel.again.add(pairKey(p.from_user, p.to_user));
  }
  for (const e of enc.data ?? []) rel.met.add(pairKey(e.user_id, e.met_user_id));
  return rel;
}

const slotLabel = (s: Slot) => `${fmtDate(s.startsAt)} ${s.region}`;

export interface RunOutcome {
  runId: string;
  alreadyRan: boolean;
  summary: Record<string, unknown>;
}

/**
 * 한 차수의 자동 매칭을 실행하고 결과를 저장한다.
 * match_runs.round_id가 unique라 같은 차수를 두 번 돌려도 두 번째는 기존 결과를 돌려준다.
 */
export async function runRound(roundId: string, actor = "system"): Promise<RunOutcome> {
  const settings = await loadSettings();

  // 1. 실행 기록을 먼저 잡는다. 이미 있으면 중복 실행이므로 멈춘다
  const { data: run, error: runErr } = await db()
    .from("match_runs")
    .insert({ round_id: roundId, algorithm_version: ALGORITHM_VERSION, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) {
    const { data: existing } = await db().from("match_runs").select("id,summary").eq("round_id", roundId).single();
    // 이미 실행된 차수가 모집 중으로 남아 있으면 스케줄러가 계속 부르니 상태를 맞춰 둔다
    await db().from("rounds").update({ status: "matched" }).eq("id", roundId).eq("status", "open");
    return { runId: existing?.id ?? "", alreadyRan: true, summary: existing?.summary ?? {} };
  }

  try {
    await db().from("rounds").update({ status: "matching" }).eq("id", roundId);

    // 2. 대상 불러오기: 제출 + 결제 완료 + 매칭 대기
    const { data: slotRows } = await db().from("slots").select("id,region,starts_at,max_tables").eq("round_id", roundId);
    const slots: Slot[] = (slotRows ?? []).map((s) => ({ id: s.id, region: s.region, startsAt: s.starts_at, maxTables: s.max_tables }));
    const slotMap = new Map(slots.map((s) => [s.id, s]));

    const { data: apps } = await db()
      .from("applications")
      .select("id,user_id,payment_status,users(account_status,profiles(*)),application_slots(slot_id)")
      .eq("round_id", roundId)
      .eq("application_status", "SUBMITTED")
      .eq("match_status", "WAITING");
    const rows = (apps ?? []) as unknown as AppRow[];

    const candidates: Candidate[] = [];
    const exceptions: { appId: string; reason: string }[] = [];
    for (const a of rows) {
      if (a.payment_status !== "PAID") continue; // 결제 안 된 신청은 후보에서 뺀다
      if (["restricted", "banned"].includes(a.users?.account_status)) continue;
      const p = Array.isArray(a.users?.profiles) ? a.users.profiles[0] : a.users?.profiles;
      if (!p) {
        exceptions.push({ appId: a.id, reason: "프로필 정보가 없어 매칭할 수 없어요" });
        continue;
      }
      candidates.push({
        applicationId: a.id,
        userId: a.user_id,
        birthYear: p.birth_year,
        gender: p.gender,
        mbti: p.mbti,
        interests: p.interests ?? [],
        myTraits: p.my_traits ?? [],
        wantedTraits: p.wanted_traits ?? [],
        slotIds: a.application_slots.map((s) => s.slot_id),
      });
    }

    // 데이터 누락은 예외 큐로 (MAT-13)
    for (const ex of exceptions) {
      await db().from("applications").update({ match_status: "EXCEPTION", match_reason: ex.reason }).eq("id", ex.appId);
      await logStatus({ entityType: "application", entityId: ex.appId, field: "match_status", from: "WAITING", to: "EXCEPTION", actor, reason: ex.reason, matchRunId: run.id });
      await db().from("exceptions").upsert(
        { kind: "data_missing", ref_type: "application", ref_id: ex.appId, reason: ex.reason, dedupe_key: `data_missing:${ex.appId}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    }

    const ids = candidates.map((c) => c.applicationId);
    if (ids.length) {
      await db().from("applications").update({ match_status: "MATCHING" }).in("id", ids);
    }

    // 3. 계산
    const rel = await loadRelations(candidates.map((c) => c.userId));
    const result = runMatching(candidates, slots, rel, settings);
    const byApp = new Map(candidates.map((c) => [c.applicationId, c]));

    // 상태 기록과 알림은 모았다가 한 번에 넣는다 (쿼리 수를 줄여 시간 제한 안에 끝내려고)
    const events: Record<string, unknown>[] = [];
    const notes: Record<string, unknown>[] = [];
    const ev = (entityId: string, field: string, from: string | null, to: string, reason: string) =>
      events.push({ entity_type: "application", entity_id: entityId, field, from_value: from, to_value: to, actor, reason, match_run_id: run.id });
    const nt = (userId: string, template: string, title: string, body: string, link: string, dedupeKey: string) =>
      notes.push({ user_id: userId, template, title, body, link, dedupe_key: dedupeKey, status: "sent", sent_at: new Date().toISOString(), scheduled_at: new Date().toISOString() });

    const tpl = await loadTemplates();
    // 4. 확정 테이블 저장
    const confirmedAt = new Date().toISOString();
    const tableIds: string[] = [];
    for (const t of result.tables) {
      const { data: table } = await db()
        .from("dining_tables")
        .insert({
          round_id: roundId,
          slot_id: t.slotId,
          match_run_id: run.id,
          status: "CONFIRMED",
          score: t.score.total,
          score_detail: t.score,
          explanation: { reasons: t.reasons, origin: t.origin },
          confirmed_at: confirmedAt,
        })
        .select("id")
        .single();
      if (!table) continue;
      tableIds.push(table.id);
      const slot = slotMap.get(t.slotId)!;
      const plain = t.applicationIds.filter((id) => !(result.outcomes[id]?.reallocCount > 0));
      const moved = t.applicationIds.filter((id) => result.outcomes[id]?.reallocCount > 0);
      const why = t.reasons.join(" · ");
      if (plain.length) {
        await db()
          .from("applications")
          .update({ match_status: "CONFIRMED", attendance_status: "SCHEDULED", table_id: table.id, realloc_count: 0, match_reason: `${slotLabel(slot)} 테이블이 확정됐어요. ${why}` })
          .in("id", plain);
      }
      for (const appId of moved) {
        const o = result.outcomes[appId];
        await db()
          .from("applications")
          .update({ match_status: "CONFIRMED", attendance_status: "SCHEDULED", table_id: table.id, realloc_count: o.reallocCount, match_reason: `${o.message}. ${why}` })
          .eq("id", appId);
        ev(appId, "match_status", "MATCHING", "REALLOCATING", "처음 조합이 조건에 맞지 않아 다른 테이블을 찾음");
      }
      for (const appId of t.applicationIds) {
        const o = result.outcomes[appId];
        ev(appId, "match_status", o && o.reallocCount > 0 ? "REALLOCATING" : "MATCHING", "CONFIRMED", o?.message ?? "자동 확정");
        const cm = render("confirmed", { date: fmtDate(slot.startsAt), time: fmtTime(slot.startsAt), region: slot.region }, tpl);
        nt(
          byApp.get(appId)!.userId,
          "confirmed",
          cm.title,
          cm.body,
          `/tables/${table.id}`,
          `confirmed:${appId}`,
        );
      }
    }

    // 5. 실패자: 대체 일정·이용권 보관·환불 선택으로 넘긴다 (MAT-11, STA-04)
    // 알림에 바로 옮길 수 있는 다른 모집 일정을 함께 적는다 (14장 매칭 실패 알림)
    const { data: openRounds } = await db().from("rounds").select("title,slots(starts_at,region)").eq("status", "open").neq("id", roundId).order("match_at").limit(2);
    const alt = (openRounds ?? [])
      .map((r) => {
        const days = [...new Set((r.slots ?? []).map((x: { starts_at: string }) => fmtDate(x.starts_at)))].join("·");
        const regions = [...new Set((r.slots ?? []).map((x: { region: string }) => x.region))].join("·");
        return `${r.title}(${days}, ${regions})`;
      })
      .join(", ");
    for (const [appId, o] of Object.entries(result.outcomes)) {
      if (o.status !== "ALTERNATIVE_OFFERED") continue;
      const c = byApp.get(appId)!;
      await db()
        .from("applications")
        .update({ match_status: "ALTERNATIVE_OFFERED", payment_status: "REFUND_AVAILABLE", realloc_count: o.reallocCount, match_reason: o.message })
        .eq("id", appId);
      ev(appId, "match_status", "MATCHING", "ALTERNATIVE_OFFERED", o.message);
      ev(appId, "payment_status", "PAID", "REFUND_AVAILABLE", "매칭 실패로 환불 선택 가능");
      const am = render("alternative", { reason: o.message, alternatives: alt ? `옮길 수 있는 일정: ${alt}. ` : "" }, tpl);
      nt(c.userId, "alternative", am.title, am.body, `/applications/${appId}/resolve`, `alternative:${appId}`);
    }
    if (events.length) await db().from("status_events").insert(events);
    if (notes.length) {
      const { data: sent } = await db().from("notifications").upsert(notes, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
      await pushNotifications((sent ?? []).map((n) => n.id)).catch(() => null);
    }

    const summary = { ...result.summary, exceptions: exceptions.length, log: result.log, criteria: settings };
    await db().from("match_runs").update({ status: "done", candidate_count: candidates.length, summary, finished_at: new Date().toISOString() }).eq("id", run.id);
    await db().from("rounds").update({ status: "matched" }).eq("id", roundId);

    // 6. 확정 뒤 자동 안내 (식당 배정, 단체방, 공지, 리마인드 예약)
    for (const id of tableIds) await afterConfirm(id);

    return { runId: run.id, alreadyRan: false, summary };
  } catch (e) {
    await db().from("match_runs").update({ status: "failed", summary: { error: String(e) }, finished_at: new Date().toISOString() }).eq("id", run.id);
    throw e;
  }
}
