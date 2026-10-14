import { logStatus } from "../events";
import { fmtDate, fmtTime } from "../format";
import { notify } from "../notify";
import { afterConfirm } from "../pipeline";
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

async function loadSettings(): Promise<MatchSettings> {
  const { data } = await db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    ...DEFAULT_SETTINGS,
    weights: { ...DEFAULT_SETTINGS.weights, ...(map.get("matching.weights") ?? {}) },
    minScore: Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore),
  };
}

async function loadRelations(userIds: string[]): Promise<Relations> {
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
      for (const appId of t.applicationIds) {
        const o = result.outcomes[appId];
        const reason = o?.message ?? "테이블이 확정됐어요";
        if (o && o.reallocCount > 0) {
          await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "MATCHING", to: "REALLOCATING", actor, reason: "처음 조합이 조건에 맞지 않아 다른 테이블을 찾음", matchRunId: run.id });
        }
        await db()
          .from("applications")
          .update({
            match_status: "CONFIRMED",
            attendance_status: "SCHEDULED",
            table_id: table.id,
            realloc_count: o?.reallocCount ?? 0,
            match_reason: `${reason}. ${t.reasons.join(" · ")}`,
          })
          .eq("id", appId);
        await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: o && o.reallocCount > 0 ? "REALLOCATING" : "MATCHING", to: "CONFIRMED", actor, reason, matchRunId: run.id });
        const c = byApp.get(appId)!;
        await notify({
          userId: c.userId,
          template: "confirmed",
          title: "테이블이 확정됐어요",
          body: `${fmtDate(slot.startsAt)} ${fmtTime(slot.startsAt)} ${slot.region}에서 만나요. 식당과 단체방 안내를 확인해 주세요.`,
          link: `/tables/${table.id}`,
          dedupeKey: `confirmed:${appId}`,
        });
      }
    }

    // 5. 실패자: 대체 일정·이용권 보관·환불 선택으로 넘긴다 (MAT-11, STA-04)
    for (const [appId, o] of Object.entries(result.outcomes)) {
      if (o.status !== "ALTERNATIVE_OFFERED") continue;
      const c = byApp.get(appId)!;
      await db()
        .from("applications")
        .update({ match_status: "ALTERNATIVE_OFFERED", payment_status: "REFUND_AVAILABLE", realloc_count: o.reallocCount, match_reason: o.message })
        .eq("id", appId);
      await logStatus({ entityType: "application", entityId: appId, field: "match_status", from: "MATCHING", to: "ALTERNATIVE_OFFERED", actor, reason: o.message, matchRunId: run.id });
      await logStatus({ entityType: "application", entityId: appId, field: "payment_status", from: "PAID", to: "REFUND_AVAILABLE", actor, reason: "매칭 실패로 환불 선택 가능", matchRunId: run.id });
      await notify({
        userId: c.userId,
        template: "alternative",
        title: "이번에는 맞는 테이블이 없었어요",
        body: `${o.message} 다른 일정으로 옮기거나, 이용권을 보관하거나, 환불받을 수 있어요.`,
        link: `/applications/${appId}/resolve`,
        dedupeKey: `alternative:${appId}`,
      });
    }

    const summary = { ...result.summary, exceptions: exceptions.length, log: result.log };
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
