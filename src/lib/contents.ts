// 대화 콘텐츠 노출 규칙 (CON-04).
// 테이블마다 유형을 매기고(첫 참가 위주인지, 인원, 나이대), 콘텐츠에 붙인 유형·관심사 태그·우선순위로 점수를 매겨 고른다.
import { db } from "./supabase";

export const TABLE_TYPES = ["first", "regular", "small", "large", "age20s", "age30s"] as const;
export type TableType = (typeof TABLE_TYPES)[number];
export const TYPE_LABEL: Record<string, string> = {
  first: "첫 참가 위주",
  regular: "재방문 위주",
  small: "4인 테이블",
  large: "5~6인 테이블",
  age20s: "20대 중심",
  age30s: "30대 이상 중심",
};

export type ContentRules = { topicCount: number; icebreakerCount: number; interestWeight: number; typeWeight: number };
export const DEFAULT_RULES: ContentRules = { topicCount: 3, icebreakerCount: 1, interestWeight: 10, typeWeight: 6 };

export async function loadContentRules(): Promise<ContentRules> {
  const { data } = await db().from("settings").select("value").eq("key", "content.rules").maybeSingle();
  const v = { ...DEFAULT_RULES, ...((data?.value as Partial<ContentRules>) ?? {}) };
  return { ...v, topicCount: Math.max(3, Math.min(6, v.topicCount)), icebreakerCount: Math.max(1, Math.min(3, v.icebreakerCount)) };
}

/** 테이블 유형. 참가자 출생연도와 이전 참석 횟수로 정한다 */
export function tableTypes(people: { birthYear: number; pastAttended: number }[], year: number): TableType[] {
  if (!people.length) return [];
  const out: TableType[] = [];
  const firsts = people.filter((p) => p.pastAttended === 0).length;
  out.push(firsts * 2 >= people.length ? "first" : "regular");
  out.push(people.length <= 4 ? "small" : "large");
  const avgAge = people.reduce((n, p) => n + (year - p.birthYear + 1), 0) / people.length;
  out.push(avgAge < 30 ? "age20s" : "age30s");
  return out;
}

type Content = { id: string; kind: string; tags: string[] | null; table_types: string[] | null; priority: number | null; body: string };

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
