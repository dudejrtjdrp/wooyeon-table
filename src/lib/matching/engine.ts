import { canJoin, validateTable } from "./constraints";
import { reasonsFor, scoreGroup } from "./score";
import {
  ALGORITHM_VERSION,
  type Candidate,
  DEFAULT_SETTINGS,
  type MatchSettings,
  type Outcome,
  type Relations,
  type RunResult,
  type Slot,
  type TableResult,
} from "./types";

interface WorkTable {
  slotId: string;
  members: Candidate[];
  origin: "initial" | "merged";
  dissolved: boolean;
}

const dateOf = (s: Slot) => s.startsAt.slice(0, 10);

/**
 * 한 차수의 자동 매칭을 실행한다. 같은 입력이면 항상 같은 결과가 나온다.
 * 순서: 첫 배치 → 일정별 묶기·분리 → 검증·해제 → 재배치 → 남은 사람끼리 병합 → 재검증 → 확정/실패
 */
export function runMatching(
  candidatesIn: Candidate[],
  slotsIn: Slot[],
  rel: Relations,
  settings: MatchSettings = DEFAULT_SETTINGS,
): RunResult {
  const log: string[] = [];
  const slots = new Map(slotsIn.map((s) => [s.id, s]));
  // 고른 일정 중 실제로 열려 있는 것만 남긴다
  const candidates = [...candidatesIn]
    .map((c) => ({ ...c, slotIds: c.slotIds.filter((id) => slots.has(id)) }))
    .sort((a, b) => a.applicationId.localeCompare(b.applicationId));

  const reallocCount = new Map<string, number>(candidates.map((c) => [c.applicationId, 0]));
  const homeSlot = new Map<string, string>();
  const failReason = new Map<string, string>();
  const moveNote = new Map<string, string>();

  // ── 1. 첫 배치: 고른 일정 중 사람이 가장 많이 몰린 곳 ──────────────────
  const demand = new Map<string, number>();
  for (const c of candidates) for (const s of c.slotIds) demand.set(s, (demand.get(s) ?? 0) + 1);

  const pools = new Map<string, Candidate[]>();
  const noSlot: Candidate[] = [];
  for (const c of candidates) {
    if (c.slotIds.length === 0) {
      noSlot.push(c);
      failReason.set(c.applicationId, "고른 일정이 모두 마감됐어요");
      continue;
    }
    let best = c.slotIds[0];
    for (const s of c.slotIds) if ((demand.get(s) ?? 0) > (demand.get(best) ?? 0)) best = s;
    homeSlot.set(c.applicationId, best);
    if (!pools.has(best)) pools.set(best, []);
    pools.get(best)!.push(c);
  }
  log.push(`대상 ${candidates.length}명, 첫 배치 일정 ${pools.size}곳`);

  // ── 2. 일정별 묶기·분리 ─────────────────────────────────────────────
  const tables: WorkTable[] = [];
  const leftovers: Candidate[] = [...noSlot];
  let splitSlots = 0;

  const orderedSlots = [...pools.keys()].sort(
    (a, b) => (pools.get(b)!.length - pools.get(a)!.length) || a.localeCompare(b),
  );
  for (const slotId of orderedSlots) {
    const pool = pools.get(slotId)!;
    const slot = slots.get(slotId)!;
    const { groups, rest } = formGroups(pool, rel, settings, slot.maxTables);
    if (groups.length > 1) splitSlots++;
    for (const g of groups) tables.push({ slotId, members: g, origin: "initial", dissolved: false });
    for (const r of rest) {
      leftovers.push(r);
      failReason.set(r.applicationId, `처음 고른 일정에서 조건에 맞는 자리가 부족했어요`);
    }
    log.push(
      `${label(slot)}: ${pool.length}명 → 테이블 ${groups.length}개${rest.length ? `, 남은 ${rest.length}명` : ""}`,
    );
  }

  // ── 3. 검증·해제: 4명 미만, 필수 조건 위반, 최소 점수 미달 ──────────────
  let dissolved = 0;
  for (const t of tables) {
    const violations = validateTable(t.members, t.slotId, rel, settings);
    const score = scoreGroup(t.members, rel, settings).total;
    if (violations.length || score < settings.minScore) {
      t.dissolved = true;
      dissolved++;
      for (const m of t.members) {
        leftovers.push(m);
        failReason.set(
          m.applicationId,
          violations.includes("size")
            ? `처음 테이블이 ${t.members.length}명이라 다른 자리를 찾았어요`
            : `처음 조합이 기준 점수에 못 미쳐 다른 자리를 찾았어요`,
        );
      }
      log.push(`${label(slots.get(t.slotId)!)} 테이블 해제 (${t.members.length}명, ${score}점, ${violations.join(",") || "점수 미달"})`);
    }
  }

  // ── 4. 재배치: PRD 7.4 순서대로 미확정 테이블에 넣어 본다 ─────────────────
  let reallocated = 0;
  const stillLeft: Candidate[] = [];
  // 고를 수 있는 일정이 적은 사람부터
  leftovers.sort((a, b) => a.slotIds.length - b.slotIds.length || a.applicationId.localeCompare(b.applicationId));
  for (const c of leftovers) {
    const target = findReallocTarget(c, tables, slots, homeSlot.get(c.applicationId), rel, settings);
    if (target) {
      target.table.members.push(c);
      reallocCount.set(c.applicationId, (reallocCount.get(c.applicationId) ?? 0) + 1);
      reallocated++;
      failReason.delete(c.applicationId);
      log.push(`${short(c)} → ${label(slots.get(target.table.slotId)!)} 테이블로 재배치 (${target.tierLabel})`);
      moveNote.set(c.applicationId, target.tierLabel);
    } else {
      stillLeft.push(c);
    }
  }

  // ── 5. 병합: 남은 사람끼리 일정이 겹치면 새 테이블로 묶는다 ─────────────
  let merged = 0;
  let remaining = stillLeft;
  for (let round = 0; round < 3 && remaining.length >= settings.minSize; round++) {
    const d = new Map<string, number>();
    for (const c of remaining) for (const s of c.slotIds) d.set(s, (d.get(s) ?? 0) + 1);
    const order = [...d.entries()].filter(([, n]) => n >= settings.minSize).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    let changed = false;
    for (const [slotId] of order) {
      const slot = slots.get(slotId)!;
      const used = tables.filter((t) => !t.dissolved && t.slotId === slotId).length;
      const room = slot.maxTables - used;
      if (room <= 0) continue;
      const pool = remaining.filter((c) => c.slotIds.includes(slotId));
      if (pool.length < settings.minSize) continue;
      const { groups } = formGroups(pool, rel, settings, room);
      const ok = groups.filter((g) => scoreGroup(g, rel, settings).total >= settings.minScore);
      if (!ok.length) continue;
      const placed = new Set<string>();
      for (const g of ok) {
        tables.push({ slotId, members: g, origin: "merged", dissolved: false });
        merged++;
        for (const m of g) {
          placed.add(m.applicationId);
          reallocCount.set(m.applicationId, (reallocCount.get(m.applicationId) ?? 0) + 1);
          failReason.delete(m.applicationId);
        }
        log.push(`남은 ${g.length}명을 ${label(slot)}에 새 테이블로 묶음`);
      }
      remaining = remaining.filter((c) => !placed.has(c.applicationId));
      changed = true;
    }
    if (!changed) break;
  }

  // ── 6. 재검증과 확정 ────────────────────────────────────────────────
  const finalTables: TableResult[] = [];
  const outcomes: Record<string, Outcome> = {};
  for (const t of tables) {
    if (t.dissolved) continue;
    const violations = validateTable(t.members, t.slotId, rel, settings);
    const score = scoreGroup(t.members, rel, settings);
    if (violations.length || score.total < settings.minScore) {
      // 재배치로 조건이 깨졌으면 확정하지 않는다
      for (const m of t.members) {
        remaining.push(m);
        failReason.set(m.applicationId, "조건에 맞는 테이블을 끝내 찾지 못했어요");
      }
      log.push(`재검증 실패로 해제: ${label(slots.get(t.slotId)!)} (${violations.join(",") || "점수 미달"})`);
      continue;
    }
    const tableIndex = finalTables.length;
    finalTables.push({
      slotId: t.slotId,
      applicationIds: t.members.map((m) => m.applicationId).sort(),
      score,
      reasons: reasonsFor(score, settings),
      origin: t.origin,
    });
    for (const m of t.members) {
      const n = reallocCount.get(m.applicationId) ?? 0;
      const note = moveNote.get(m.applicationId);
      outcomes[m.applicationId] = {
        status: "CONFIRMED",
        tableIndex,
        reallocCount: n,
        message:
          n === 0
            ? `${label(slots.get(t.slotId)!)} 테이블이 확정됐어요`
            : `처음 테이블이 조건에 맞지 않아 ${note ?? "다른 테이블"}로 옮겨 확정됐어요`,
      };
    }
  }

  for (const c of remaining) {
    outcomes[c.applicationId] = {
      status: "ALTERNATIVE_OFFERED",
      reallocCount: reallocCount.get(c.applicationId) ?? 0,
      message: failReason.get(c.applicationId) ?? "조건에 맞는 테이블을 찾지 못했어요",
    };
  }

  const confirmed = Object.values(outcomes).filter((o) => o.status === "CONFIRMED").length;
  log.push(`확정 테이블 ${finalTables.length}개 (${confirmed}명), 대안 안내 ${remaining.length}명`);

  return {
    version: ALGORITHM_VERSION,
    tables: finalTables,
    outcomes,
    summary: {
      candidates: candidates.length,
      tablesCreated: tables.length,
      splitSlots,
      dissolved,
      reallocated,
      merged,
      confirmed,
      failed: remaining.length,
    },
    log,
  };
}

/**
 * 한 일정의 후보를 4~6명 테이블로 나눈다.
 * 가장 자리 찾기 어려운 사람(같이 앉을 수 있는 사람이 적은 사람)을 먼저 씨앗으로 두고,
 * 점수가 가장 오르는 사람을 한 명씩 더한다.
 */
export function formGroups(
  pool: Candidate[],
  rel: Relations,
  settings: MatchSettings,
  maxTables: number,
): { groups: Candidate[][]; rest: Candidate[] } {
  const groups: Candidate[][] = [];
  const skipped: Candidate[] = [];
  let free = [...pool];

  while (free.length >= settings.minSize && groups.length < maxTables) {
    const n = free.length;
    const k = Math.max(1, Math.min(Math.ceil(n / settings.maxSize), Math.floor(n / settings.minSize)));
    const target = Math.min(settings.maxSize, Math.ceil(n / k));

    const compat = (c: Candidate) => free.filter((o) => o !== c && canJoin([c], o, rel, settings)).length;
    const seed = [...free].sort(
      (a, b) => compat(a) - compat(b) || a.birthYear - b.birthYear || a.applicationId.localeCompare(b.applicationId),
    )[0];

    const group = [seed];
    while (group.length < target) {
      let best: Candidate | null = null;
      let bestScore = -Infinity;
      for (const c of free) {
        if (group.includes(c) || !canJoin(group, c, rel, settings)) continue;
        const s = scoreGroup([...group, c], rel, settings).total;
        if (s > bestScore || (s === bestScore && best && c.applicationId < best.applicationId)) {
          best = c;
          bestScore = s;
        }
      }
      if (!best) break;
      group.push(best);
    }

    if (group.length >= settings.minSize) {
      groups.push(group);
      free = free.filter((c) => !group.includes(c));
    } else {
      // 씨앗과 함께 앉을 사람이 부족하다. 씨앗만 빼고 나머지로 다시 시도한다
      free = free.filter((c) => c !== seed);
      skipped.push(seed);
    }
  }
  const rest = [...skipped, ...free];
  improveGroups(groups, rest, rel, settings);
  return { groups, rest };
}

/**
 * 테이블끼리, 그리고 테이블과 남은 사람 사이에서 한 명씩 맞바꿔 본다.
 * 두 테이블 중 낮은 쪽 점수가 오르면 바꾼다. 최소 점수 미달로 해제되는 테이블을 줄이기 위한 단계.
 */
function improveGroups(
  groups: Candidate[][],
  rest: Candidate[],
  rel: Relations,
  settings: MatchSettings,
): void {
  const sc = (g: Candidate[]) => scoreGroup(g, rel, settings).total;
  const valid = (g: Candidate[]) => {
    for (let i = 0; i < g.length; i++) if (!canJoin(g.slice(0, i), g[i], rel, settings)) return false;
    return true;
  };
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    // 테이블 ↔ 테이블
    for (let x = 0; x < groups.length; x++) {
      for (let y = x + 1; y < groups.length; y++) {
        const gx = groups[x];
        const gy = groups[y];
        const before = Math.min(sc(gx), sc(gy));
        let best: { i: number; j: number; v: number } | null = null;
        for (let i = 0; i < gx.length; i++) {
          for (let j = 0; j < gy.length; j++) {
            const nx = [...gx];
            const ny = [...gy];
            [nx[i], ny[j]] = [gy[j], gx[i]];
            if (!valid(nx) || !valid(ny)) continue;
            const v = Math.min(sc(nx), sc(ny));
            if (v > before + 0.05 && (!best || v > best.v)) best = { i, j, v };
          }
        }
        if (best) {
          const tmp = gx[best.i];
          gx[best.i] = gy[best.j];
          gy[best.j] = tmp;
          improved = true;
        }
      }
    }
    // 테이블 ↔ 남은 사람
    for (const g of groups) {
      const before = sc(g);
      let best: { i: number; r: number; v: number } | null = null;
      for (let i = 0; i < g.length; i++) {
        for (let r = 0; r < rest.length; r++) {
          const ng = [...g];
          ng[i] = rest[r];
          if (!valid(ng)) continue;
          const v = sc(ng);
          if (v > before + 0.05 && before < settings.minScore && (!best || v > best.v)) best = { i, r, v };
        }
      }
      if (best) {
        const out = g[best.i];
        g[best.i] = rest[best.r];
        rest[best.r] = out;
        improved = true;
      }
    }
    if (!improved) break;
  }
}

function findReallocTarget(
  c: Candidate,
  tables: WorkTable[],
  slots: Map<string, Slot>,
  homeSlotId: string | undefined,
  rel: Relations,
  settings: MatchSettings,
): { table: WorkTable; tierLabel: string } | null {
  const home = homeSlotId ? slots.get(homeSlotId) : undefined;
  const tierOf = (s: Slot): { tier: number; label: string } => {
    if (!home) return { tier: 4, label: "고르신 다른 일정" };
    const sameDate = dateOf(s) === dateOf(home);
    const sameRegion = s.region === home.region;
    if (sameDate && sameRegion) return { tier: 1, label: "같은 날짜·같은 지역의 다른 테이블" };
    if (sameDate) return { tier: 2, label: `같은 날 ${s.region} 테이블` };
    if (sameRegion) return { tier: 3, label: `${s.region}의 다른 날짜 테이블` };
    return { tier: 4, label: `고르신 다른 일정(${s.region})` };
  };

  let best: { table: WorkTable; tier: number; score: number; label: string } | null = null;
  for (const t of tables) {
    if (t.dissolved || t.members.length >= settings.maxSize) continue;
    if (!c.slotIds.includes(t.slotId)) continue;
    if (!canJoin(t.members, c, rel, settings)) continue;
    const score = scoreGroup([...t.members, c], rel, settings).total;
    if (score < settings.minScore) continue;
    const { tier, label } = tierOf(slots.get(t.slotId)!);
    if (!best || tier < best.tier || (tier === best.tier && score > best.score)) {
      best = { table: t, tier, score, label };
    }
  }
  return best ? { table: best.table, tierLabel: best.label } : null;
}

function label(s: Slot): string {
  const d = new Date(s.startsAt);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${md} ${s.region}`;
}

function short(c: Candidate): string {
  return c.applicationId.slice(0, 8);
}
