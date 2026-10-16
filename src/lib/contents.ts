// 대화 콘텐츠 노출 규칙 (CON-02, CON-04).
// 테이블마다 유형을 매기고(첫 참가 위주인지, 인원, 나이대, 대화 성향), 콘텐츠에 붙인 유형·관심사 태그·우선순위로 점수를 매겨 고른다.
// 대화 성향은 프로필의 MBTI E/I 비율과 '본인 성향'(유쾌한·차분한 등)으로 정한다. 같은 관심사라도 성향이 다르면 다른 주제가 나온다.
import { db } from "./supabase";

export const TABLE_TYPES = ["first", "regular", "small", "large", "age20s", "age30s", "lively", "calm", "mixed"] as const;
export type TableType = (typeof TABLE_TYPES)[number];
export const TYPE_LABEL: Record<string, string> = {
  first: "첫 참가 위주",
  regular: "재방문 위주",
  small: "4인 테이블",
  large: "5~6인 테이블",
  age20s: "20대 중심",
  age30s: "30대 이상 중심",
  lively: "말하기 좋아하는 분이 많은 테이블",
  calm: "차분한 분이 많은 테이블",
  mixed: "말하는 분·듣는 분이 섞인 테이블",
};

export type Tone = "lively" | "calm" | "mixed";
const LIVELY_TRAITS = ["유쾌한", "리액션 좋은", "에너지 넘치는"];
const CALM_TRAITS = ["차분한", "다정한", "진지한"];

/**
 * 테이블 대화 성향. MBTI를 적은 사람은 E/I로, 안 적은 사람은 본인 성향으로 센다.
 * 활발한 쪽이 60% 이상이면 lively, 40% 이하면 calm, 그 사이면 mixed.
 */
export function talkTone(people: { mbti: string | null; traits: string[] }[]): { tone: Tone; outgoing: number; counted: number } {
  let outgoing = 0;
  let counted = 0;
  for (const p of people) {
    if (p.mbti && /^[EI]/.test(p.mbti)) {
      counted++;
      if (p.mbti[0] === "E") outgoing++;
      continue;
    }
    const up = p.traits.filter((t) => LIVELY_TRAITS.includes(t)).length;
    const down = p.traits.filter((t) => CALM_TRAITS.includes(t)).length;
    if (up === down) continue;
    counted++;
    if (up > down) outgoing++;
  }
  if (!counted) return { tone: "mixed", outgoing, counted };
  const r = outgoing / counted;
  return { tone: r >= 0.6 ? "lively" : r <= 0.4 ? "calm" : "mixed", outgoing, counted };
}

/**
 * 대화 성향별 기본 콘텐츠. 운영자가 어드민에 같은 유형으로 등록한 콘텐츠가 있으면 그것과 함께 순위를 매긴다.
 * id가 builtin:으로 시작해 DB 콘텐츠와 겹치지 않는다.
 */
export const TONE_CONTENTS: Content[] = [
  { id: "builtin:lively-1", kind: "topic", tags: [], table_types: ["lively"], priority: 1, body: "최근에 충동적으로 해 버린 일 중에 제일 잘한 일은 뭐예요?" },
  { id: "builtin:lively-2", kind: "topic", tags: [], table_types: ["lively"], priority: 1, body: "아무 계획 없는 주말 하루가 생기면 뭐부터 할 거예요?" },
  { id: "builtin:lively-3", kind: "icebreaker", tags: [], table_types: ["lively"], priority: 1, body: "나는 ○○파: 돌아가며 '나는 ○○파'를 하나씩 말하고, 같은 파인 사람은 손을 들어 주세요" },
  { id: "builtin:calm-1", kind: "topic", tags: [], table_types: ["calm"], priority: 1, body: "혼자 있는 시간에 제일 좋아하는 일은 뭐예요?" },
  { id: "builtin:calm-2", kind: "topic", tags: [], table_types: ["calm"], priority: 1, body: "요즘 마음이 편해지는 곳이 있다면 어디예요?" },
  { id: "builtin:calm-3", kind: "icebreaker", tags: [], table_types: ["calm"], priority: 1, body: "사진 한 장 이야기: 휴대폰 사진첩에서 최근 사진 한 장을 골라 얽힌 이야기를 들려주세요" },
  { id: "builtin:mixed-1", kind: "topic", tags: [], table_types: ["mixed"], priority: 1, body: "친구들 사이에서 나는 주로 말하는 쪽이에요, 듣는 쪽이에요? 오늘은 어느 쪽일 것 같아요?" },
  { id: "builtin:mixed-2", kind: "icebreaker", tags: [], table_types: ["mixed"], priority: 1, body: "질문 릴레이: 오른쪽 사람에게 궁금한 걸 하나 묻고, 답한 사람이 다음 사람에게 묻기" },
];

export type ContentRules = { topicCount: number; icebreakerCount: number; interestWeight: number; typeWeight: number };
export const DEFAULT_RULES: ContentRules = { topicCount: 3, icebreakerCount: 1, interestWeight: 10, typeWeight: 6 };

export async function loadContentRules(): Promise<ContentRules> {
  const { data } = await db().from("settings").select("value").eq("key", "content.rules").maybeSingle();
  const v = { ...DEFAULT_RULES, ...((data?.value as Partial<ContentRules>) ?? {}) };
  return { ...v, topicCount: Math.max(3, Math.min(6, v.topicCount)), icebreakerCount: Math.max(1, Math.min(3, v.icebreakerCount)) };
}

/** 테이블 유형. 참가자 출생연도와 이전 참석 횟수, 대화 성향(MBTI·본인 성향)으로 정한다 */
export function tableTypes(people: { birthYear: number; pastAttended: number; mbti?: string | null; traits?: string[] }[], year: number): TableType[] {
  if (!people.length) return [];
  const out: TableType[] = [];
  const firsts = people.filter((p) => p.pastAttended === 0).length;
  out.push(firsts * 2 >= people.length ? "first" : "regular");
  out.push(people.length <= 4 ? "small" : "large");
  const avgAge = people.reduce((n, p) => n + (year - p.birthYear + 1), 0) / people.length;
  out.push(avgAge < 30 ? "age20s" : "age30s");
  out.push(talkTone(people.map((p) => ({ mbti: p.mbti ?? null, traits: p.traits ?? [] }))).tone);
  return out;
}

export type Content = { id: string; kind: string; tags: string[] | null; table_types: string[] | null; priority: number | null; body: string };

/** 같은 테이블에는 늘 같은 결과가 나오도록 테이블 id로 섞는다 */
function jitter(seed: string, id: string) {
  let h = 0;
  for (const ch of seed + id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0) / 2 ** 32;
}

export function rank(all: Content[], kind: "topic" | "icebreaker", common: string[], types: string[], rules: ContentRules, seed: string) {
  return all
    .filter((c) => c.kind === kind)
    .filter((c) => !(c.table_types ?? []).length || (c.table_types ?? []).some((t) => types.includes(t)))
    .map((c) => {
      const tagHit = common.findIndex((t) => (c.tags ?? []).includes(t));
      const interest = tagHit === -1 ? 0 : rules.interestWeight * (1 - tagHit * 0.15);
      const typeHit = (c.table_types ?? []).filter((t) => types.includes(t)).length * rules.typeWeight;
      return { c, score: interest + typeHit + (c.priority ?? 0) + jitter(seed, c.id) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

/**
 * 순위대로 n개를 고르되, 테이블 대화 성향(lively·calm·mixed)에 맞춘 콘텐츠가 하나는 들어가게 한다.
 * 관심사 주제만 위에 몰려도 테이블 분위기에 맞는 질문 하나는 남긴다.
 */
export function pickWithTone(ranked: Content[], n: number, types: string[]): Content[] {
  const tone = types.find((t) => t === "lively" || t === "calm" || t === "mixed");
  const top = ranked.slice(0, n);
  if (!tone || !n || top.some((c) => (c.table_types ?? []).includes(tone))) return top;
  const fit = ranked.slice(n).find((c) => (c.table_types ?? []).includes(tone));
  return fit ? [...top.slice(0, n - 1), fit] : top;
}

/** 대화 주제·아이스브레이킹 고르기 (DB 콘텐츠 + 성향별 기본 콘텐츠) */
export function chooseContents(all: Content[], common: string[], types: string[], rules: ContentRules, seed: string) {
  const pool = [...all, ...TONE_CONTENTS];
  const topics = pickWithTone(rank(pool, "topic", common, types, rules, seed), rules.topicCount, types);
  const icebreakers = pickWithTone(rank(pool, "icebreaker", common, types, rules, seed), rules.icebreakerCount, types);
  return { topics, icebreakers };
}
