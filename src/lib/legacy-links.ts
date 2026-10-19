// 화면을 탭으로 나누면서 바뀐 주소. 예전 링크·#해시 링크로 들어와도 맞는 탭으로 보낸다 (legacy-links.test.ts)

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
const keep = (sp: SP, keys: string[]) => {
  const q = new URLSearchParams();
  for (const k of keys) {
    const v = one(sp, k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

const NOTICE_KEYS = ["ns", "nr", "nt", "nm", "nq", "m", "e"];
const PERSON_KEYS = ["u", "pq", "r", "m", "e"];

/** /admin/messages 에 예전 공지·템플릿 주소로 들어오면 갈 곳. 그대로 두면 null */
export function messagesLegacyTarget(sp: SP): string | null {
  const tab = one(sp, "tab");
  if (tab === "templates" || tab === "tpl") return `/admin/messages/templates${keep(sp, ["m", "e"])}`;
  if (tab === "notice" || ["ns", "nr", "nt", "nm", "nq"].some((k) => one(sp, k))) return `/admin/messages/notice${keep(sp, NOTICE_KEYS)}`;
  return null;
}

/** /admin/feedback 에 예전 사람별 보기(?u=, ?pq=)·신고 주소로 들어오면 갈 곳 */
export function feedbackLegacyTarget(sp: SP): string | null {
  const tab = one(sp, "tab");
  if (tab === "reports") return `/admin/feedback/reports${keep(sp, ["m", "e"])}`;
  if (tab === "person" || one(sp, "u") || one(sp, "pq")) return `/admin/feedback/person${keep(sp, PERSON_KEYS)}`;
  return null;
}

/**
 * #해시는 서버에 오지 않아서 화면에서 옮긴다. rules: 해시 → 갈 경로. '#tpl-confirmed'처럼 접두어가 맞아도 옮기고, 해시는 그대로 붙인다.
 * search(?뒤)는 그대로 넘긴다. 이미 그 경로면 null
 */
export function hashTarget(path: string, hash: string, search: string, rules: Record<string, string>): string | null {
  const h = hash.replace(/^#/, "");
  if (!h) return null;
  const hit = Object.entries(rules).find(([k]) => h === k || h.startsWith(`${k}-`));
  if (!hit || hit[1] === path) return null;
  const exact = h === hit[0];
  return `${hit[1]}${search}${exact ? "" : `#${h}`}`;
}

export const MESSAGES_HASH: Record<string, string> = {
  templates: "/admin/messages/templates",
  template: "/admin/messages/templates",
  tpl: "/admin/messages/templates",
  notice: "/admin/messages/notice",
};
export const FEEDBACK_HASH: Record<string, string> = {
  reports: "/admin/feedback/reports",
  person: "/admin/feedback/person",
  safety: "/admin/feedback/person",
};
