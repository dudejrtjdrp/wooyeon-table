import { isBot } from "../sim/persona-id";
import { logStatus } from "../events";
import { now } from "../clock";
import { fmtDay, fmtSlot } from "../format";
import { afterConfirm, notifyConfirmed } from "../pipeline";
import { pushNotifications } from "../push";
import { loadTemplates, render } from "../templates";
import { db } from "../supabase";
import { nearSlotsFor } from "../regions";
import { runMatching } from "./engine";
import { blockedReason } from "./blocked";
import { type FeedbackRow, feedbackSignals } from "./feedback";
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
  users: { account_status: string; restricted_until: string | null; profiles: ProfileRow | ProfileRow[] | null };
  application_slots: { slot_id: string }[];
  areas: string[] | null;
  dates: string[] | null;
  near_ok: boolean | null;
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
  const [blocks, reports, prefs, enc, who] = await Promise.all([
    db().from("blocks").select("blocker_id,blocked_id").in("blocker_id", userIds),
    db().from("safety_reports").select("reporter_id,reported_id").in("reporter_id", userIds),
    db().from("person_prefs").select("from_user,to_user,pref").in("from_user", userIds),
    db().from("encounters").select("user_id,met_user_id").in("user_id", userIds),
    db().from("users").select("id,login_id,is_demo").in("id", userIds),
  ]);
  // 시연 봇이 대본으로 남긴 '또 만나고 싶어요'와 후기는 다음 매칭 점수에 넣지 않는다(가짜 신호가 섞이지 않게). '다시는 싫어요'는 안전 쪽이라 그대로 지킨다
  const bots = new Set((who.data ?? []).filter((u) => isBot(u)).map((u) => u.id as string));
  for (const b of blocks.data ?? []) rel.excluded.add(pairKey(b.blocker_id, b.blocked_id));
  // 신고가 접수되면 처리 결과와 상관없이 두 사람을 분리한다 (PRD 15장)
  for (const r of reports.data ?? []) rel.excluded.add(pairKey(r.reporter_id, r.reported_id));
  for (const p of prefs.data ?? []) {
    if (p.pref === "avoid") rel.excluded.add(pairKey(p.from_user, p.to_user));
    else if (!bots.has(p.from_user)) rel.again.add(pairKey(p.from_user, p.to_user));
  }
  for (const e of enc.data ?? []) rel.met.add(pairKey(e.user_id, e.met_user_id));

  // 피드백 루프 (F11): 후기 점수와 참석 횟수를 다음 매칭에 넣는다. 못 읽어도 매칭은 그대로 돈다
  // 같은 상대와 여러 번 앉았으면 그 테이블들의 후기를 평균하고, 참석이 많은 사람의 후기를 더 믿는다(feedback.ts)
  const [fb, att] = await Promise.all([
    db().from("feedbacks").select("user_id,table_id,mood_score,talk_score,rejoin_intent,created_at").in("user_id", userIds),
    db().from("applications").select("user_id").in("user_id", userIds).eq("attendance_status", "ATTENDED"),
  ]);
  const feedbacks = ((fb.data ?? []) as FeedbackRow[]).filter((f) => !bots.has(f.user_id));
  const attended = new Map<string, number>();
  for (const a of att.data ?? []) attended.set(a.user_id, (attended.get(a.user_id) ?? 0) + 1);
  const fbTables = [...new Set(feedbacks.map((f) => f.table_id))];
  const { data: seats } = fbTables.length
    ? await db().from("applications").select("user_id,table_id").in("table_id", fbTables).eq("attendance_status", "ATTENDED")
    : { data: [] as { user_id: string; table_id: string }[] };
  const sig = feedbackSignals(feedbacks, seats ?? [], attended);
  rel.cool = sig.cool;
  rel.coolWeight = sig.coolWeight;
  rel.history = sig.history;
  return rel;
}

const slotLabel = (s: Slot) => `${fmtSlot(s.startsAt)} ${s.region}`;

export interface RunOutcome {
  runId: string;
  alreadyRan: boolean;
  summary: Record<string, unknown>;
}

/**
 * 한 차수의 자동 매칭을 실행하고 결과를 저장한다.
 * match_runs.round_id가 unique라 같은 차수를 두 번 돌려도 두 번째는 기존 결과를 돌려준다.
 * resumeFailed: 실패로 끝난 실행을 같은 기록으로 다시 돌린다. 테이블이 하나도 안 만들어졌을 때만 쓴다(lib/pipeline.ts recoverMatchRuns)
 */
export async function runRound(roundId: string, actor = "system", opts: { resumeFailed?: boolean } = {}): Promise<RunOutcome> {
  const settings = await loadSettings();

  // 0. 닫힌(취소 포함) 회차는 돌리지 않는다: 운영자가 회차를 취소하는 사이 '지금 처리'가 눌려도 상태를 되살리지 않게
  const { data: rnd } = await db().from("rounds").select("status").eq("id", roundId).maybeSingle();
  if (!rnd || rnd.status === "closed") return { runId: "", alreadyRan: true, summary: { skipped: rnd ? "closed" : "missing" } };

  // 1. 실행 기록을 먼저 잡는다. 이미 있으면 중복 실행이므로 멈춘다
  // 시연 시계를 쓰는 환경에서도 실행 시각이 회차 날짜와 어긋나지 않게 시연 시계 기준으로 남긴다
  const startedIso = (await now()).toISOString();
  let { data: run, error: runErr } = await db()
    .from("match_runs")
    .insert({ round_id: roundId, algorithm_version: ALGORITHM_VERSION, status: "running", started_at: startedIso })
    .select("id")
    .single();
  if ((runErr || !run) && opts.resumeFailed) {
    // 실패한 기록을 다시 '실행 중'으로 바꾼 한 곳만 이어서 돈다 (동시에 두 번 돌지 않게)
    const { data: claimed } = await db()
      .from("match_runs")
      .update({ status: "running", algorithm_version: ALGORITHM_VERSION, started_at: startedIso, finished_at: null })
      .eq("round_id", roundId)
      .eq("status", "failed")
      .select("id");
    if (claimed?.length) {
      run = { id: claimed[0].id };
      runErr = null;
    }
  }
  if (runErr || !run) {
    const { data: existing } = await db().from("match_runs").select("id,summary").eq("round_id", roundId).single();
    // 이미 실행된 차수가 모집 중으로 남아 있으면 스케줄러가 계속 부르니 상태를 맞춰 둔다
    await db().from("rounds").update({ status: "matched" }).eq("id", roundId).eq("status", "open");
    return { runId: existing?.id ?? "", alreadyRan: true, summary: existing?.summary ?? {} };
  }

  try {
    // 0단계 확인과 여기 사이에 회차가 취소돼 닫혔으면(rounds/actions.ts cancelRound) 멈춘다.
    // 닫힌 회차만 멈춘다: 동시에 들어온 다른 실행·스케줄러가 회차를 'matched'로 맞춰 둔 경우(위 중복 경로)나
    // 복구(resumeFailed)는 이 실행 기록을 잡은 쪽이므로 그대로 이어서 돈다.
    // 취소 쪽은 '모집 중'일 때만 닫으므로, 여기서 먼저 '매칭 중'이 되면 취소가 막혀 둘이 엇갈리지 않는다
    const { data: started } = await db().from("rounds").update({ status: "matching" }).eq("id", roundId).neq("status", "closed").select("id");
    if (!started?.length) {
      // 기록을 지우지 않고 '취소로 건너뜀'으로 남긴다 (MatchRun 기록)
      const summary = { skipped: "canceled", reason: "실행을 시작하는 사이 회차가 취소돼 매칭하지 않았어요" };
      await db().from("match_runs").update({ status: "done", finished_at: (await now()).toISOString(), summary }).eq("id", run.id).eq("status", "running");
      return { runId: run.id, alreadyRan: true, summary };
    }

    // 2. 대상 불러오기: 제출 + 결제 완료 + 매칭 대기
    const { data: slotRows, error: slotErr } = await db().from("slots").select("id,region,sido,starts_at,max_tables").eq("round_id", roundId);
    if (slotErr) throw new Error(`일정 조회 실패: ${slotErr.message}`);
    const slots: Slot[] = (slotRows ?? []).map((s) => ({ id: s.id, region: s.region, startsAt: s.starts_at, maxTables: s.max_tables }));
    const slotMap = new Map(slots.map((s) => [s.id, s]));

    const { data: apps, error: appErr } = await db()
      .from("applications")
      .select("id,user_id,payment_status,areas,dates,near_ok,users(account_status,restricted_until,profiles(*)),application_slots(slot_id)")
      .eq("round_id", roundId)
      .eq("application_status", "SUBMITTED")
      .eq("match_status", "WAITING");
    if (appErr) throw new Error(`신청 조회 실패: ${appErr.message}`);
    const rows = (apps ?? []) as unknown as AppRow[];

    const candidates: Candidate[] = [];
    const exceptions: { appId: string; reason: string; kind?: string }[] = [];
    const runAt = await now();
    for (const a of rows) {
      if (a.payment_status !== "PAID") continue; // 결제 안 된 신청은 후보에서 뺀다
      // 제한 기한이 지났으면 제한이 풀린 것으로 본다 (기한 지난 제한 때문에 정상 참가자가 빠지지 않게)
      // 결제까지 한 뒤 제한된 사람은 조용히 빼면 매칭 대기로 영영 남는다: 이유를 남기고 운영자가 환불·안내하도록 예외 처리함으로
      const blocked = blockedReason(a.users?.account_status, a.users?.restricted_until ?? null, runAt);
      if (blocked) {
        exceptions.push({ appId: a.id, kind: "account_blocked", reason: blocked });
        continue;
      }
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
        // '가까운 동네도 괜찮아요'를 켠 사람만 붙어 있는 동네(같은 날짜)로 넓힐 수 있다
        nearSlotIds: a.near_ok && a.areas?.length ? nearSlotsFor(a.areas, a.dates ?? [], slotRows ?? []) : undefined,
      });
    }

    // 데이터 누락·계정 제한은 예외 큐로 (MAT-13). 신청은 EXCEPTION으로 두어 대기에 묶이지 않게 한다
    for (const ex of exceptions) {
      await db().from("applications").update({ match_status: "EXCEPTION", match_reason: ex.reason }).eq("id", ex.appId);
      await logStatus({ entityType: "application", entityId: ex.appId, field: "match_status", from: "WAITING", to: "EXCEPTION", actor, reason: ex.reason, matchRunId: run.id });
      await db().from("exceptions").upsert(
        { kind: "data_missing", ref_type: "application", ref_id: ex.appId, reason: ex.reason, dedupe_key: `${ex.kind ?? "data_missing"}:${ex.appId}` },
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
      notes.push({ user_id: userId, template, title, body, link, dedupe_key: dedupeKey, status: "sent", sent_at: runAt.toISOString(), scheduled_at: runAt.toISOString() });

    const tpl = await loadTemplates();
    // 4. 확정 테이블 저장
    const confirmedAt = (await now()).toISOString();
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
      }
      // 확정 알림은 여기서 보내지 않는다. 식당 배정·단체방 개설 뒤 afterConfirm이 식당명과 함께 보낸다(6단계)
    }

    // 5. 실패자: 대체 일정·이용권 보관·환불 선택으로 넘긴다 (MAT-11, STA-04)
    // 알림에 바로 옮길 수 있는 다른 모집 일정을 함께 적는다 (14장 매칭 실패 알림)
    const { data: openRounds } = await db().from("rounds").select("title,slots(starts_at,region)").eq("status", "open").neq("id", roundId).order("match_at").limit(2);
    const alt = (openRounds ?? [])
      .map((r) => {
        const days = [...new Set((r.slots ?? []).map((x: { starts_at: string }) => fmtDay(x.starts_at)))].join("·");
        const regions = [...new Set((r.slots ?? []).map((x: { region: string }) => x.region))].join("·");
        return `${r.title}(${days}, ${regions})`;
      })
      .join(", ");
    const failedApps: string[] = [];
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
      failedApps.push(appId);
    }
    if (events.length) await db().from("status_events").insert(events);
    // 멤버십 이용자는 실패한 만큼 기간을 늘려 준다 (운영사 Q&A)
    if (failedApps.length) {
      const { extendMembershipFor } = await import("../billing");
      for (const id of failedApps) await extendMembershipFor(id, "system");
    }
    if (notes.length) {
      const { data: sent } = await db().from("notifications").upsert(notes, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
      await pushNotifications((sent ?? []).map((n) => n.id)).catch(() => null);
    }

    const summary = { ...result.summary, exceptions: exceptions.length, log: result.log, criteria: settings };
    await db().from("match_runs").update({ status: "done", candidate_count: candidates.length, summary, finished_at: (await now()).toISOString() }).eq("id", run.id);
    await db().from("rounds").update({ status: "matched" }).eq("id", roundId);

    // 6. 확정 뒤 자동 안내 (식당 배정, 단체방, 공지, 리마인드 예약)
    // 한 테이블이 실패해도 나머지는 계속한다. 첫 공지가 없는 테이블은 tick이 다시 돌린다(pipeline.ts resumeAfterConfirm)
    for (const id of tableIds) {
      try {
        await afterConfirm(id);
      } catch (e) {
        console.error("[runner] 확정 뒤 안내 실패", id, e);
        await logStatus({ entityType: "dining_table", entityId: id, field: "after_confirm", to: "FAILED", actor: "system", reason: `확정 뒤 안내 실패, 다음 자동 실행 때 다시 해요: ${String(e).slice(0, 200)}`, matchRunId: run.id }).catch(() => null);
        // 식당·단체방이 늦어져도 확정 사실은 바로 알린다 (INF-01). 식당은 정해지면 '식당이 정해졌어요'로 따로 간다
        await notifyConfirmed(id).catch(() => null);
      }
    }

    return { runId: run.id, alreadyRan: false, summary };
  } catch (e) {
    await db().from("match_runs").update({ status: "failed", summary: { error: String(e) }, finished_at: await now().then((d) => d.toISOString(), () => new Date().toISOString()) }).eq("id", run.id);
    throw e;
  }
}
