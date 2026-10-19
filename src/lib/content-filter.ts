// 대화 콘텐츠(/admin/contents) 검색·거르기. DB를 읽지 않는 순수 함수만 둔다 (content-filter.test.ts)
// 검색은 본문·관심사 태그·테이블 유형 이름을 함께 본다. 거르기는 주소 쿼리에 남아 새로 고침·저장 뒤에도 그대로다
import { TABLE_TYPES, TYPE_LABEL } from "./contents";

/** 태그를 비워 둔 '모든 관심사' 콘텐츠만 보기 */
export const TAG_NONE = "none";
/** 테이블 유형을 비워 둔 '모든 유형' 콘텐츠만 보기 */
export const TYPE_NONE = "none";

export interface ContentFilter {
  /** 대화 주제 / 아이스브레이킹 */
  k: "topic" | "icebreaker";
  /** 본문·태그·테이블 유형 이름 일부 */
  q?: string;
  /** 관심사 태그 하나 또는 none */
  tag?: string;
  /** 테이블 유형 키 또는 none */
  type?: string;
  /** on=노출 중, off=노출 중지 */
  state?: "on" | "off";
}

type SP = Record<string, string | string[] | undefined>;
const pick = (sp: SP, key: string) => {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};

export function parseContentFilter(sp: SP): ContentFilter {
  const type = pick(sp, "type");
  const state = pick(sp, "state");
  return {
    k: pick(sp, "k") === "icebreaker" ? "icebreaker" : "topic",
    q: pick(sp, "q")?.replace(/\s+/g, " ").slice(0, 40),
    tag: pick(sp, "tag")?.slice(0, 20),
    type: type === TYPE_NONE || (TABLE_TYPES as readonly string[]).includes(type ?? "") ? type : undefined,
    state: state === "on" || state === "off" ? state : undefined,
  };
}

export const contentFiltered = (f: ContentFilter) => Boolean(f.q || f.tag || f.type || f.state);

/** 거르기 → 주소 쿼리. k는 늘 붙인다(저장 뒤 같은 탭으로 돌아오게) */
export function contentSearch(f: Partial<ContentFilter>): string {
  const p = new URLSearchParams();
  p.set("k", f.k === "icebreaker" ? "icebreaker" : "topic");
  for (const key of ["q", "tag", "type", "state"] as const) if (f[key]) p.set(key, f[key]!);
  return `?${p.toString()}`;
}

/** 저장·노출 전환 뒤 돌아갈 주소의 쿼리를 받아 믿을 수 있는 값만 다시 만든다 (폼의 back 값) */
export function contentBack(raw: string | null | undefined, kind?: string): string {
  const sp = Object.fromEntries(new URLSearchParams(String(raw ?? "").replace(/^\?/, "")));
  if (kind) sp.k = kind;
  return contentSearch(parseContentFilter(sp));
}

export type ContentRow = { body: string; tags: string[] | null; table_types: string[] | null; active: boolean };

export function filterContents<T extends ContentRow>(rows: T[], f: ContentFilter): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const q = f.q ? norm(f.q.replace(/^#/, "")) : "";
  return rows.filter((c) => {
    const tags = c.tags ?? [];
    const types = c.table_types ?? [];
    if (q) {
      const hay = [c.body, ...tags, ...types.map((t) => TYPE_LABEL[t] ?? t)].map(norm);
      if (!hay.some((h) => h.includes(q))) return false;
    }
    if (f.tag === TAG_NONE ? tags.length > 0 : f.tag && !tags.includes(f.tag)) return false;
    if (f.type === TYPE_NONE ? types.length > 0 : f.type && !types.includes(f.type)) return false;
    if (f.state && c.active !== (f.state === "on")) return false;
    return true;
  });
}

/** 거르기 칸에 보일 태그 목록: 지금 종류의 콘텐츠에 붙은 태그를 많이 쓰인 순으로 */
export function tagOptions(rows: ContentRow[]): string[] {
  const n = new Map<string, number>();
  for (const c of rows) for (const t of c.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([t]) => t);
}
