// 시연용 봇이 언제 무슨 말을 할지 정한다 (DB 없이 계산만). 실제로 올리는 건 bots.ts
import { type Persona, arrivalMinutes, rand } from "./persona";
import { type Ctx, type Intent, type QaTopic, ARRIVE_EARLY, ARRIVE_ON_TIME, BYE, DAY_MENU, DAY_PLAN, DAY_QA, GREET, GREET_MORE, LATE_ARRIVE, LATE_WARN, intents, pick, replyTo, shape } from "./scripts";

/** 모임이 시작되면 다들 식당에 마주 앉아 있으니, 대화 주제에 채팅으로 답하는 단계(topic)는 두지 않는다 (성효님 결정 2026-10-21) */
export type Phase = "hello" | "daybefore" | "arrive" | "bye";
/** hello는 확정 공지가 올라온 실제 시각 기준, 나머지는 모임 일정(시연 시계) 기준 */
export type PlanMsg = { key: string; userId: string; phase: Phase; due: number; body: string };

const MIN = 60_000;
const between = (seed: number, key: string, lo: number, hi: number) => lo + rand(seed, key) * (hi - lo);

export type PlanInput = {
  tableId: string;
  bots: Persona[];
  ctx: Ctx;
  startMs: number;
  endMs: number;
  /** 확정 공지가 올라온 실제 시각 (없으면 인사도 없다) */
  noticeAt: number | null;
  noShow: string | null;
  /** 사람이 단체방에서 이미 물은 질문 주제. 봇은 같은 주제를 다시 묻지 않는다 */
  askedTopics?: Set<QaTopic>;
  /** 봇 질문이 이미 올라갔으면 그 문장 (답이 질문과 어긋나지 않게 같은 짝을 쓴다) */
  postedQuestion?: string | null;
};

export const msgKey = (tableId: string, userId: string, phase: string, n: number | string) => `bot:${tableId}:${userId}:${phase}:${n}`;

/** 말 많은 사람부터. 같으면 테이블마다 다른 순서 */
function order(bots: Persona[], tableId: string, key: string): Persona[] {
  const w = { chatty: 0, polite: 0.35, brief: 0.6 } as const;
  return [...bots].sort((a, b) => w[a.tone] + rand(a.seed, `${tableId}:${key}`) * 0.5 - (w[b.tone] + rand(b.seed, `${tableId}:${key}`) * 0.5));
}

export function planTable(i: PlanInput): PlanMsg[] {
  const out: PlanMsg[] = [];
  const used = new Set<string>();
  const add = (p: Persona, phase: Phase, n: number | string, due: number, body: string | null) => {
    if (body) out.push({ key: msgKey(i.tableId, p.userId, phase, n), userId: p.userId, phase, due: Math.round(due), body });
  };
  const t = i.tableId;

  // (a) 확정 직후: 모두 한 번씩, 말 많은 사람은 한 번 더. 20초~2분 간격으로 번갈아
  if (i.noticeAt !== null) {
    let at = i.noticeAt + 15_000;
    for (const p of order(i.bots, t, "hello")) {
      at += between(p.seed, `${t}:h`, 25_000, 110_000);
      add(p, "hello", 1, at, pick(GREET, p, i.ctx, `${t}:greet`, used));
      if (p.tone === "chatty" || (p.tone === "polite" && rand(p.seed, `${t}:more`) < 0.3)) {
        add(p, "hello", 2, at + between(p.seed, `${t}:h2`, 50_000, 200_000), pick(GREET_MORE, p, i.ctx, `${t}:more`, used));
      }
    }
  }

  // (b) 하루 전 리마인드 뒤 한 시간 안: 도착 계획 · 식당 얘기 · 질문과 답
  const eve = i.startMs - 24 * 60 * MIN;
  const talkers = order(i.bots, t, "day").slice(0, 3);
  if (talkers[0]) add(talkers[0], "daybefore", 1, eve + between(talkers[0].seed, `${t}:d1`, 2, 10) * MIN, pick(DAY_PLAN, talkers[0], i.ctx, `${t}:plan`, used));
  if (talkers[1]) add(talkers[1], "daybefore", 1, eve + between(talkers[1].seed, `${t}:d2`, 11, 22) * MIN, pick(DAY_MENU, talkers[1], i.ctx, `${t}:menu`, used));
  const asker = talkers[2] ?? talkers[0];
  const answerer = talkers.find((x) => x !== asker && x !== talkers[2]) ?? null;
  if (asker && answerer && answerer !== asker) {
    const qa = pickQa(rand(asker.seed, `${t}:qa`), i.askedTopics, i.postedQuestion);
    if (qa) {
    const qAt = eve + between(asker.seed, `${t}:dq`, 24, 36) * MIN;
    add(asker, "daybefore", 2, qAt, qa.q);
    add(answerer, "daybefore", 2, qAt + between(answerer.seed, `${t}:da`, 1.5, 6) * MIN, shape(answerer, qa.a(answerer, i.ctx), `${t}:qa`));
    }
  }

  // (c) 모임 시작 전후: 도착 소식, 늦는 사람은 미리 알리고 나중에 도착. 안 오는 사람(노쇼)은 말이 없다
  const here = i.bots.filter((p) => p.userId !== i.noShow);
  for (const p of here) {
    const m = arrivalMinutes(p);
    if (p.arrival === "early") add(p, "arrive", 1, i.startMs + m * MIN, pick(ARRIVE_EARLY, p, i.ctx, `${t}:early`, used));
    else if (p.arrival === "late") {
      add(p, "arrive", 1, i.startMs - between(p.seed, `${t}:lw`, 1, 4) * MIN, pick(LATE_WARN, p, i.ctx, `${t}:warn`, used));
      add(p, "arrive", 2, i.startMs + m * MIN, pick(LATE_ARRIVE, p, i.ctx, `${t}:larr`, used));
    } else if (p.tone !== "brief" || rand(p.seed, `${t}:ot`) < 0.4) add(p, "arrive", 1, i.startMs + m * MIN, pick(ARRIVE_ON_TIME, p, i.ctx, `${t}:ontime`, used));
  }
  // (d) 끝난 뒤: 두세 명이 인사. 첫 사람은 끝나자마자
  const byes = order(here, t, "bye").slice(0, 2 + (rand(i.startMs, `${t}:bn`) < 0.5 ? 1 : 0));
  byes.forEach((p, k) => add(p, "bye", 1, i.endMs + (k === 0 ? between(p.seed, `${t}:b0`, 0, 0.6) : between(p.seed, `${t}:b`, 3 + k * 5, 10 + k * 10)) * MIN, pick(BYE, p, i.ctx, `${t}:bye`, used)));

  return out.sort((a, b) => a.due - b.due);
}

/**
 * 하루 전 봇 질문 고르기. 이미 올라간 질문이 있으면 그 짝, 아니면 사람이 묻지 않은 주제 가운데 하나(r은 0~1).
 * 사람이 모든 주제를 물었으면 null(묻지 않는다)
 */
export function pickQa(r: number, asked?: Set<QaTopic>, posted?: string | null): (typeof DAY_QA)[number] | null {
  const same = posted ? DAY_QA.find((x) => x.q === posted) : undefined;
  if (same) return same;
  // 원래 고르던 질문이 겹치지 않으면 그대로 둔다 (다른 테이블 대사가 바뀌지 않게)
  const first = DAY_QA[Math.floor(r * DAY_QA.length)];
  if (!asked?.has(first.topic)) return first;
  const pool = DAY_QA.filter((x) => !asked.has(x.topic));
  return pool.length ? pool[Math.floor(r * pool.length)] : null;
}

/**
 * 봇이 사람 말에 답하기 전에 먼저 해야 할 인사. 확정 인사(hello 1번)가 아직 안 올라갔고 인사할 때(모임 시작 전)면 그 메시지.
 * 답장이 인사보다 먼저 나가 '드디어 확정됐네요, 안녕하세요'가 대화 중간에 끼던 문제를 막는다
 */
export function greetFirst(plan: PlanMsg[], posted: Set<string | null>, userId: string, demoNow: number, startMs: number, endMs: number): PlanMsg | null {
  const hello = plan.find((m) => m.userId === userId && m.phase === "hello" && m.key.endsWith(":hello:1"));
  if (!hello || posted.has(hello.key) || !phaseOpen("hello", demoNow, startMs, endMs)) return null;
  return hello;
}

/** 단계마다 올릴 수 있는 시연 시각 범위. 지나면 그 단계 말은 건너뛴다 (늦게 켠 봇이 지난 얘기를 꺼내지 않게) */
export function phaseOpen(phase: Phase, demoNow: number, startMs: number, endMs: number): boolean {
  if (phase === "hello" || phase === "daybefore") return demoNow < startMs;
  if (phase === "arrive") return demoNow < endMs;
  return demoNow < endMs + 24 * 60 * MIN;
}

/**
 * 한 번에 올릴 메시지들의 시각. 원래 시각(실제 시각으로 바꾼 값)을 지키되,
 * 방의 마지막 메시지(lower)보다 뒤, 지금(upper)보다 앞에 둔다. 시계를 크게 옮겨 몰리면 그 사이에 고르게 펼친다.
 */
export function spreadTimes(dues: number[], lower: number, upper: number): number[] {
  if (!dues.length) return [];
  const hi = Math.max(upper, lower + dues.length * 1000);
  const out: number[] = [];
  const stuck = dues.filter((d) => d <= lower).length;
  const nextFree = dues.find((d) => d > lower);
  const room = Math.min(hi, nextFree ?? hi) - lower;
  const gap = Math.min(75_000, room / (stuck + 1));
  for (let k = 0; k < dues.length; k++) {
    let x = k < stuck ? lower + gap * (k + 1) : Math.min(dues[k], hi);
    if (k > 0) x = Math.max(x, out[k - 1] + 1000);
    out.push(x);
  }
  // 지금을 넘으면 뒤에서부터 1초씩 당긴다
  for (let k = out.length - 1; k >= 0; k--) out[k] = Math.min(out[k], hi - (out.length - 1 - k) * 1000);
  return out.map(Math.round);
}

/** 모임 중(마주 앉아 있을 때) 채팅으로 답할 만한 말: 늦는다·도착했다·어디 앉았는지·몇 시에 오는지 */
const ON_SITE: Intent[] = ["late", "arrive", "place", "time"];

/**
 * 사람 메시지 하나에 답할 봇 1~2명과 할 말. 인사·질문이면 둘, 아니면 대개 한 명.
 * onSite(모임 시작 뒤)면 현장 얘기(도착·자리·늦음)에만 한 명이 짧게 답하고, 나머지 말엔 답하지 않는다
 */
export function planReplies(msgId: string, text: string, bots: Persona[], ctx: Ctx, used?: Set<string>, greeting?: Set<string>, onSite = false): { userId: string; body: string; delayMs: number }[] {
  if (!bots.length) return [];
  const site = onSite ? intents(text).filter((x) => ON_SITE.includes(x)) : null;
  if (site && !site.length) return [];
  const skip: Intent[] = site ? (["greet", "menu", "thanks", "question", "other", ...ON_SITE] as Intent[]).filter((x) => !site.includes(x)) : [];
  const asks = /\?|안녕|반가|몇 ?시/.test(text);
  const n = site ? 1 : Math.min(bots.length, asks || rand(msgId, "n") < 0.35 ? 2 : 1);
  const w = { chatty: 0, polite: 0.3, brief: 0.7 } as const;
  const who = [...bots].sort((a, b) => w[a.tone] + rand(a.seed, msgId) - (w[b.tone] + rand(b.seed, msgId))).slice(0, n);
  return who.map((p, k) => ({
    userId: p.userId,
    // 이번에 확정 인사를 먼저 하는 봇은 답에서 인사를 또 하지 않는다
    body: replyTo(p, text, ctx, msgId, k, used, [...skip, ...(greeting?.has(p.userId) ? (["greet"] as Intent[]) : [])]),
    delayMs: Math.round(k === 0 ? between(p.seed, `${msgId}:d`, 6_000, 25_000) : between(p.seed, `${msgId}:d`, 30_000, 90_000)),
  }));
}

/** 이 테이블에서 안 나타날 봇 한 명 (셋 중 둘꼴). 시연에서 노쇼 후보가 보이게 */
export function pickNoShow(tableId: string, botIds: string[]): string | null {
  if (botIds.length < 2 || rand(tableId, "noshow") >= 0.67) return null;
  const sorted = [...botIds].sort();
  return sorted[Math.floor(rand(tableId, "noshow-who") * sorted.length)];
}

/**
 * 기준 메시지(대화 주제 공지) 앞에 끼워 넣을 시각들. 모두 anchor보다 앞이고 서로 1초 이상 떨어진다.
 * 앞 메시지(lower)와 공지 사이가 좁으면 lower를 앞으로 당겨서라도 공지 뒤로 밀리지 않게 한다
 */
export function beforeAnchor(dues: number[], lower: number, anchor: number): number[] {
  if (!dues.length) return [];
  const top = anchor - 1000;
  const lo = Math.min(lower, top - dues.length * 1000);
  return spreadTimes(dues.map((d) => Math.min(d, top)), lo, top).map((x) => Math.min(x, top));
}
