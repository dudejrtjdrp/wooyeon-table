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
  // 본인이 동의한 일정 범위(고른 일정 + 가까운 동네). widen이 slotIds를 늘려도 재검증은 이 범위로 본다
  const consent = new Map(candidates.map((c) => [c.applicationId, new Set([...c.slotIds, ...(c.nearSlotIds ?? [])])]));

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

  // ── 1-1. 균형 맞추기: 4명이 안 되는 일정은 그 일정도 고른 사람을 다른 일정에서 데려온다.
  //         넘치는 일정(테이블 상한 × 6명 초과)은 다른 일정도 고른 사람을 내보낸다.
  const size = (id: string) => pools.get(id)?.length ?? 0;
  const cap = (id: string) => slots.get(id)!.maxTables * settings.maxSize;
  const move = (c: Candidate, from: string, to: string) => {
    pools.set(from, pools.get(from)!.filter((x) => x !== c));
    if (!pools.has(to)) pools.set(to, []);
    pools.get(to)!.push(c);
    homeSlot.set(c.applicationId, to);
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    // 넘치는 일정에서 덜어내기
    for (const id of [...pools.keys()]) {
      while (size(id) > cap(id)) {
        const flex = pools.get(id)!.find((c) => c.slotIds.some((o) => o !== id && size(o) < cap(o)));
        if (!flex) break;
        const to = flex.slotIds.filter((o) => o !== id && size(o) < cap(o)).sort((a, b) => size(b) - size(a))[0];
        move(flex, id, to);
        changed = true;
      }
    }
    // 모자란 일정 채우기
    for (const id of [...slots.keys()]) {
      const cur = size(id);
      if (cur === 0 || cur >= settings.minSize) continue;
      const donors = candidates.filter((c) => {
        const h = homeSlot.get(c.applicationId);
        return h && h !== id && c.slotIds.includes(id) && size(h) - 1 >= settings.minSize && size(h) % settings.minSize !== 0;
      });
      const need = settings.minSize - cur;
      if (donors.length >= need) {
        for (const d of donors.slice(0, need)) move(d, homeSlot.get(d.applicationId)!, id);
        changed = true;
      } else {
        // 채울 수 없으면 이 일정 사람 중 다른 일정도 고른 사람은 그쪽으로 보낸다
        for (const c of [...pools.get(id)!]) {
          const to = c.slotIds.filter((o) => o !== id && size(o) >= settings.minSize - 1 && size(o) < cap(o)).sort((a, b) => size(b) - size(a))[0];
          if (to) {
            move(c, id, to);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  for (const [id, pool] of [...pools.entries()]) if (!pool.length) pools.delete(id);

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
    // 점수가 기준에 못 미치면 통째로 해제하기 전에, 점수를 가장 깎는 사람부터 한 명씩 빼 본다
    let trimmed = 0;
    while (
      t.members.length > settings.minSize &&
      validateTable(t.members, t.slotId, rel, settings).length === 0 &&
      scoreGroup(t.members, rel, settings).gate < settings.minScore
    ) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      t.members.forEach((_, i) => {
        const v = scoreGroup(t.members.filter((__, j) => j !== i), rel, settings).total;
        if (v > bestScore) {
          bestScore = v;
          bestIdx = i;
        }
      });
      const [out] = t.members.splice(bestIdx, 1);
      leftovers.push(out);
      failReason.set(out.applicationId, "처음 테이블의 조합 점수를 맞추느라 다른 자리를 찾았어요");
      trimmed++;
    }
    if (trimmed) log.push(`${label(slots.get(t.slotId)!)} 테이블에서 ${trimmed}명을 빼서 점수를 맞춤`);
    const violations = validateTable(t.members, t.slotId, rel, settings);
    const score = scoreGroup(t.members, rel, settings).gate;
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
      const ok = groups.filter((g) => scoreGroup(g, rel, settings).gate >= settings.minScore);
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

  // ── 5-1. 가까운 동네 확장: '가까운 동네도 괜찮아요'를 켠 사람만 붙어 있는 동네로 ──
  //         끈 사람은 고른 묶음 밖으로 보내지 않는다(희망 지역 반영). 기존 테이블 합류 → 새로 묶기 순서.
  const near = (c: Candidate) => c.nearSlotIds ?? [];
  const widen = (c: Candidate, slotId: string) => {
    if (!c.slotIds.includes(slotId)) c.slotIds = [...c.slotIds, slotId];
    reallocCount.set(c.applicationId, (reallocCount.get(c.applicationId) ?? 0) + 1);
    failReason.delete(c.applicationId);
  };
  if (remaining.some((c) => near(c).length)) {
    const after: Candidate[] = [];
    for (const c of remaining) {
      if (!near(c).length) {
        after.push(c);
        continue;
      }
      const probe = { ...c, slotIds: near(c) };
      const target = findReallocTarget(probe, tables, slots, homeSlot.get(c.applicationId), rel, settings);
      if (target) {
        const to = slots.get(target.table.slotId)!;
        widen(c, to.id);
        target.table.members.push(c);
        moveNote.set(c.applicationId, `가까운 동네 ${to.region} 테이블`);
        log.push(`${short(c)} → 가까운 동네 ${label(to)} 테이블로 합류`);
      } else after.push(c);
    }
    remaining = after;
    // 남은 사람끼리: 일정마다 그 일정을 고른 사람 + 가까운 동네로 허용한 사람을 모은다
    const allowed = (c: Candidate) => [...c.slotIds, ...near(c)];
    for (let round = 0; round < 3 && remaining.length >= settings.minSize; round++) {
      const d = new Map<string, number>();
      for (const c of remaining) for (const s of allowed(c)) d.set(s, (d.get(s) ?? 0) + 1);
      const order = [...d.entries()].filter(([, n]) => n >= settings.minSize).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      let changed = false;
      for (const [slotId] of order) {
        const slot = slots.get(slotId);
        if (!slot) continue;
        const used = tables.filter((t) => !t.dissolved && t.slotId === slotId).length;
        const room = slot.maxTables - used;
        if (room <= 0) continue;
        const pool = remaining.filter((c) => allowed(c).includes(slotId));
        // 원래 이 묶음을 고른 사람이 한 명도 없으면 열지 않는다 (아무도 안 고른 동네에 테이블을 만들지 않음)
        if (pool.length < settings.minSize || !pool.some((c) => c.slotIds.includes(slotId))) continue;
        const { groups } = formGroups(pool, rel, settings, room);
        const ok = groups.filter((g) => scoreGroup(g, rel, settings).gate >= settings.minScore);
        if (!ok.length) continue;
        const placed = new Set<string>();
        for (const g of ok) {
          tables.push({ slotId, members: g, origin: "merged", dissolved: false });
          merged++;
          for (const m of g) {
            placed.add(m.applicationId);
            if (!m.slotIds.includes(slotId)) {
              widen(m, slotId);
              moveNote.set(m.applicationId, `가까운 동네 ${slot.region} 테이블`);
            } else {
              reallocCount.set(m.applicationId, (reallocCount.get(m.applicationId) ?? 0) + 1);
              failReason.delete(m.applicationId);
            }
          }
          log.push(`가까운 동네까지 넓혀 ${g.length}명을 ${label(slot)}에 새 테이블로 묶음`);
        }
        remaining = remaining.filter((c) => !placed.has(c.applicationId));
        changed = true;
      }
      if (!changed) break;
    }
  }
  for (const c of remaining) {
    if (!failReason.has(c.applicationId) || failReason.get(c.applicationId)!.startsWith("처음")) {
      failReason.set(
        c.applicationId,
        near(c).length ? "이웃 동네까지 찾아봤는데 4명이 안 모였어요" : "고른 동네에서 4명이 안 모였어요",
      );
    }
  }

  // ── 6. 재검증과 확정 ────────────────────────────────────────────────
  const finalTables: TableResult[] = [];
  const outcomes: Record<string, Outcome> = {};
  for (const t of tables) {
    if (t.dissolved) continue;
    const violations = validateTable(t.members, t.slotId, rel, settings);
    if (t.members.some((m) => !consent.get(m.applicationId)?.has(t.slotId))) violations.push("slot");
    const score = scoreGroup(t.members, rel, settings);
    if (violations.length || score.gate < settings.minScore) {
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
  // 가까운 동네로 옮겨 실제로 확정된 사람 수 (해제된 테이블은 세지 않는다)
  const widened = finalTables.reduce(
    (n, t) => n + t.applicationIds.filter((id) => moveNote.get(id)?.startsWith("가까운 동네") && !candidatesIn.find((c) => c.applicationId === id)?.slotIds.includes(t.slotId)).length,
    0,
  );
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
      widened,
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
    // 한 명 옮기기: 인원이 넉넉한 테이블(5~6명)에서 덜 찬 테이블로. 성비를 맞추는 데 특히 필요하다
    for (let x = 0; x < groups.length; x++) {
      for (let y = 0; y < groups.length; y++) {
        if (x === y) continue;
        const gx = groups[x];
        const gy = groups[y];
        if (gx.length <= settings.minSize || gy.length >= settings.maxSize) continue;
        const before = Math.min(sc(gx), sc(gy));
        let best: { i: number; v: number } | null = null;
        for (let i = 0; i < gx.length; i++) {
          const nx = gx.filter((_, k) => k !== i);
          const ny = [...gy, gx[i]];
          if (!valid(ny)) continue;
          const v = Math.min(sc(nx), sc(ny));
          if (v > before + 0.05 && (!best || v > best.v)) best = { i, v };
        }
        if (best) {
          gy.push(gx.splice(best.i, 1)[0]);
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
    const sd = scoreGroup([...t.members, c], rel, settings);
    if (sd.gate < settings.minScore) continue;
    const score = sd.total;
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
