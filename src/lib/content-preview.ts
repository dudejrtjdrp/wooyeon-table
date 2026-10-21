// 대화 콘텐츠 미리 보기 (/admin/contents). 고르는 일은 contents.ts의 chooseContents가 그대로 하고,
// 여기서는 운영자에게 '왜 이게 뽑혔는지'를 풀어 쓰고 단체방에 올라갈 글을 만든다. DB를 읽지 않는 순수 함수만 둔다 (content-preview.test.ts)
import { type Content, type ContentRules, TONE_CONTENTS, TYPE_LABEL, type TableType, chooseContents, rank } from "./contents";

/** 테이블 유형을 운영자 말로: 무엇을 보고 정하는지 */
export const TYPE_GROUPS: { name: string; hint: string; items: { key: TableType; label: string; how: string }[] }[] = [
  { name: "경험", hint: "이전에 와 본 적이 있는지", items: [
    { key: "first", label: "처음 온 분이 많은 테이블", how: "처음 오는 분이 절반 이상" },
    { key: "regular", label: "와 본 분이 많은 테이블", how: "와 본 분이 절반 넘게" },
  ] },
  { name: "인원", hint: "테이블에 앉는 사람 수", items: [
    { key: "small", label: "4명 테이블", how: "4명 이하" },
    { key: "large", label: "5~6명 테이블", how: "5명 이상" },
  ] },
  { name: "나이", hint: "테이블 평균 나이", items: [
    { key: "age20s", label: "20대 중심", how: "평균 30살 미만" },
    { key: "age30s", label: "30대 이상 중심", how: "평균 30살 이상" },
  ] },
  { name: "분위기", hint: "MBTI 첫 글자(E/I)와 프로필의 '나는 이런 사람'", items: [
    { key: "lively", label: "말하기 좋아하는 분이 많은 테이블", how: "E이거나 유쾌한·리액션 좋은 분이 60% 이상" },
    { key: "calm", label: "차분한 분이 많은 테이블", how: "활발한 분이 40% 이하" },
    { key: "mixed", label: "말하는 분·듣는 분이 섞인 테이블", how: "그 사이" },
  ] },
];

/** 테이블 유형 키 → 운영자 말 */
export const TYPE_NAME: Record<string, string> = Object.fromEntries(TYPE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])));

export type Reason = { text: string; points: number };
export type Pick = { c: Content; reasons: Reason[]; total: number; toneFill: boolean; builtin: boolean };

/**
 * 점수 풀이. contents.ts rank()와 같은 계산이다(섞기용 0~1 값만 뺀다).
 * 관심사: 테이블에서 많이 겹친 관심사일수록 크다(1순위 100%, 2순위 85%, 3순위 70%…)
 */
export function explainScore(c: Content, common: string[], types: string[], rules: ContentRules): Reason[] {
  const out: Reason[] = [];
  const tagHit = common.findIndex((t) => (c.tags ?? []).includes(t));
  if (tagHit !== -1) out.push({ text: `#${common[tagHit]} · 테이블 관심사 ${tagHit + 1}순위`, points: rules.interestWeight * (1 - tagHit * 0.15) });
  for (const t of c.table_types ?? []) if (types.includes(t)) out.push({ text: TYPE_NAME[t] ?? TYPE_LABEL[t] ?? t, points: rules.typeWeight });
  if (c.priority) out.push({ text: "우선순위", points: c.priority });
  return out;
}

const sum = (r: Reason[]) => Math.round(r.reduce((n, x) => n + x.points, 0) * 10) / 10;

/**
 * 단체방에 올라가는 글. pipeline.ts tick()의 '모임 시작' 메시지와 같은 모양이다.
 * 모임 중엔 다들 마주 앉아 있으니 채팅으로 답하라는 말이 아니라 테이블에서 나누자는 말로 쓴다
 */
export const CONTENT_INTRO = "자리에 다 모이셨나요? 휴대폰은 잠시 내려놓고, 아래 이야기를 테이블에서 함께 나눠 보세요.";
export const CONTENT_OUTRO = "모임 정보의 '지금 테이블에서'에서도 다시 볼 수 있어요.";
export function contentMessage(topics: { body: string }[], icebreakers: { body: string }[]): string {
  return [
    CONTENT_INTRO,
    "\n오늘의 대화 주제",
    ...topics.map((x, i) => `${i + 1}. ${x.body}`),
    icebreakers.length ? `\n아이스브레이킹\n${icebreakers.map((x) => `· ${x.body}`).join("\n")}` : "",
    `\n${CONTENT_OUTRO}`,
  ].join("\n");
}

/** 단체방에 올라간 글에서 대화 주제(번호 줄)와 아이스브레이킹(· 줄)을 다시 꺼낸다. 모임 정보 화면이 같은 내용을 보여 주려고 쓴다 */
export function parseContentMessage(body: string): { topics: string[]; icebreakers: string[] } {
  const lines = body.split("\n").map((l) => l.trim());
  return {
    topics: lines.map((l) => l.match(/^\d+\.\s*(.+)$/)?.[1]).filter((x): x is string => Boolean(x)),
    icebreakers: lines.map((l) => l.match(/^·\s*(.+)$/)?.[1]).filter((x): x is string => Boolean(x)),
  };
}

/** 실제로 고를 콘텐츠(chooseContents)와 그 이유, 아깝게 빠진 주제까지 */
export function previewContents(active: Content[], common: string[], types: string[], rules: ContentRules, seed: string) {
  const { topics, icebreakers } = chooseContents(active, common, types, rules, seed);
  const pool = [...active, ...TONE_CONTENTS];
  const wrap = (kind: "topic" | "icebreaker", chosen: Content[], n: number) => {
    const ranked = rank(pool, kind, common, types, rules, seed);
    const top = new Set(ranked.slice(0, n).map((c) => c.id));
    const as = (c: Content): Pick => {
      const reasons = explainScore(c, common, types, rules);
      return { c, reasons, total: sum(reasons), toneFill: !top.has(c.id), builtin: c.id.startsWith("builtin:") };
    };
    const ids = new Set(chosen.map((c) => c.id));
    return { picks: chosen.map(as), next: ranked.filter((c) => !ids.has(c.id)).slice(0, 2).map(as) };
  };
  const t = wrap("topic", topics, rules.topicCount);
  const i = wrap("icebreaker", icebreakers, rules.icebreakerCount);
  return { topics: t.picks, icebreakers: i.picks, nextTopics: t.next, message: contentMessage(topics, icebreakers) };
}

/* ── 미리 보기 조건 (주소 쿼리 p*) ── */

export type Preview =
  | { mode: "table"; table: string }
  | { mode: "custom"; interests: string[]; exp: "first" | "regular"; size: "small" | "large"; age: "age20s" | "age30s"; tone: "lively" | "calm" | "mixed" };

export const DEFAULT_CUSTOM: Extract<Preview, { mode: "custom" }> = { mode: "custom", interests: ["여행", "맛집 탐방"], exp: "first", size: "small", age: "age20s", tone: "lively" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";
const oneOf = <T extends string>(v: string, xs: readonly T[], d: T): T => ((xs as readonly string[]).includes(v) ? (v as T) : d);

export function parsePreview(sp: SP, interests: readonly string[]): Preview {
  const table = one(sp.pt);
  if (table && /^[\w-]{1,64}$/.test(table)) return { mode: "table", table };
  if (one(sp.pv) !== "custom") return DEFAULT_CUSTOM;
  // 직접 정하기: 관심사를 하나도 안 고를 수도 있다(관심사가 안 겹치는 테이블)
  const raw = sp.pi;
  const picked = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => x.trim()).filter((x) => interests.includes(x)))].slice(0, 3);
  return {
    mode: "custom",
    interests: picked,
    exp: oneOf(one(sp.pe), ["first", "regular"] as const, "first"),
    size: oneOf(one(sp.ps), ["small", "large"] as const, "small"),
    age: oneOf(one(sp.pa), ["age20s", "age30s"] as const, "age20s"),
    tone: oneOf(one(sp.po), ["lively", "calm", "mixed"] as const, "lively"),
  };
}

/** 직접 정한 조건 → 테이블 유형 (tableTypes와 같은 순서) */
export const customTypes = (p: Extract<Preview, { mode: "custom" }>): TableType[] => [p.exp, p.size, p.age, p.tone];

/** 저장 뒤 돌아갈 때: 폼에 실어 보낸 미리 보기 쿼리를 믿을 수 있는 값만 다시 만든다. 미리 보기를 건드리지 않았으면 빈 문자열 */
export function previewBack(raw: string | null | undefined, interests: readonly string[]): string {
  const q = new URLSearchParams(String(raw ?? "").replace(/^[?&]/, ""));
  if (!q.has("pt") && !q.has("pv")) return "";
  const sp: SP = {};
  for (const k of new Set(q.keys())) sp[k] = q.getAll(k);
  return previewQuery(parsePreview(sp, interests));
}

/** 미리 보기 조건 → 쿼리 조각(앞에 & 없이) */
export function previewQuery(p: Preview): string {
  const q = new URLSearchParams();
  if (p.mode === "table") q.set("pt", p.table);
  else {
    q.set("pv", "custom");
    for (const i of p.interests) q.append("pi", i);
    q.set("pe", p.exp);
    q.set("ps", p.size);
    q.set("pa", p.age);
    q.set("po", p.tone);
  }
  return q.toString();
}
