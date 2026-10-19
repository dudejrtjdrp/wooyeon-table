// 전체 변경 이력(/admin/audit)의 거르기·라벨. DB를 읽지 않는 순수 함수만 둔다 (audit.test.ts)
import { actorLabel, eventText, fieldLabel } from "./labels";

// ── 대상 종류 ─────────────────────────────────────────
// status_events.entity_type 여러 개를 운영자가 아는 묶음으로. 템플릿은 setting 중 field가 template:으로 시작하는 줄이다
export const AUDIT_KINDS = [
  { key: "round", label: "회차·매칭", types: ["round", "slot", "match_run"] },
  { key: "application", label: "신청·이용권", types: ["application", "pass", "payment"] },
  { key: "table", label: "테이블·단체방", types: ["dining_table", "chat_room"] },
  { key: "venue", label: "식당·예약", types: ["venue", "reservation"] },
  { key: "setting", label: "설정", types: ["setting", "content", "region_demand"] },
  { key: "template", label: "자동 메시지 문구", types: ["setting"] },
  { key: "account", label: "계정", types: ["user"] },
  { key: "exception", label: "예외 처리", types: ["exception"] },
  { key: "notice", label: "알림", types: ["notification"] },
  { key: "export", label: "내려받기", types: ["admin_export"] },
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number]["key"];
const KIND_KEYS = new Set<string>(AUDIT_KINDS.map((k) => k.key));
export const kindLabel = (k: AuditKind) => AUDIT_KINDS.find((x) => x.key === k)!.label;

/** 이력 한 줄이 어느 묶음인지 */
export function auditKindOf(entityType: string, field: string): AuditKind | "other" {
  if (entityType === "setting") return field.startsWith("template:") ? "template" : "setting";
  return AUDIT_KINDS.find((k) => (k.types as readonly string[]).includes(entityType))?.key ?? "other";
}

// ── 거르기 ───────────────────────────────────────────
export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilter {
  kind?: AuditKind;
  /** '' 전체 · admin 운영자 전체 · system 자동 · user 참가자 · admin:<id> 운영자 한 명 */
  actor?: string;
  /** YYYY-MM-DD (서울 날짜, 그날 포함) */
  from?: string;
  to?: string;
  q?: string;
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDay = (d: string | undefined) => (d && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00+09:00`)) ? d : undefined);

/** 검색어에서 PostgREST or() 문법을 깨는 글자(, ( ) * % \ " ')를 빼고 50자까지 */
export function cleanQuery(q: string | undefined): string | undefined {
  const v = (q ?? "").replace(/[,()*%\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  return v || undefined;
}

export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const kind = one("kind");
  const actor = one("actor") ?? "";
  const okActor = actor === "admin" || actor === "system" || actor === "user" || (actor.startsWith("admin:") && UUID.test(actor.slice(6)));
  let from = validDay(one("from"));
  let to = validDay(one("to"));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Math.max(1, Math.min(10000, Math.floor(Number(one("page")) || 1)));
  return { kind: kind && KIND_KEYS.has(kind) ? (kind as AuditKind) : undefined, actor: okActor ? actor : undefined, from, to, q: cleanQuery(one("q")), page };
}

/** 서울 날짜 하루의 시작 시각(UTC ISO) */
export const kstDayStart = (d: string) => new Date(`${d}T00:00:00+09:00`).toISOString();
const kstNextDayStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+09:00`) + 86_400_000).toISOString();

/** DB 조회에 쓸 조건. 실제 쿼리는 audit-query.ts가 이걸 그대로 옮긴다 */
export interface AuditQuery {
  types?: string[];
  fieldLike?: string;
  fieldNotLike?: string;
  actorEq?: string;
  actorLike?: string;
  since?: string;
  until?: string;
  /** reason·from_value·to_value에서 찾는 말 (대상 이름 검색은 audit-query.ts가 id를 찾아 덧붙인다) */
  search?: string;
  offset: number;
  limit: number;
}

export function auditQuery(f: AuditFilter, limit = AUDIT_PAGE_SIZE): AuditQuery {
  const q: AuditQuery = { offset: (f.page - 1) * limit, limit };
  if (f.kind) {
    q.types = [...AUDIT_KINDS.find((k) => k.key === f.kind)!.types];
    if (f.kind === "template") q.fieldLike = "template:%";
    if (f.kind === "setting") q.fieldNotLike = "template:%";
  }
  if (f.actor === "system") q.actorEq = "system";
  else if (f.actor === "admin") q.actorLike = "admin:%";
  else if (f.actor === "user") q.actorLike = "user:%";
  else if (f.actor) q.actorEq = f.actor;
  if (f.from) q.since = kstDayStart(f.from);
  if (f.to) q.until = kstNextDayStart(f.to);
  if (f.q) q.search = f.q;
  return q;
}

/** 거르기를 주소 쿼리로 (페이지 넘기기·CSV 링크가 같은 거르기를 쓴다). page 1은 생략 */
export function auditSearch(f: AuditFilter, page = f.page): string {
  const p = new URLSearchParams();
  if (f.kind) p.set("kind", f.kind);
  if (f.actor) p.set("actor", f.actor);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.q) p.set("q", f.q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** CSV 감사 로그에 남길 거르기 설명: "대상 설정 · 10월 1일~10월 19일 · 검색 '가중치'" */
export function describeFilter(f: AuditFilter, adminNames?: Map<string, string>): string {
  const parts: string[] = [];
  if (f.kind) parts.push(`대상 ${kindLabel(f.kind)}`);
  if (f.actor) parts.push(`누가 ${f.actor === "admin" ? "운영자 전체" : f.actor === "system" ? "자동" : f.actor === "user" ? "참가자" : actorLabel(f.actor, adminNames)}`);
  if (f.from || f.to) parts.push(`기간 ${f.from ?? "처음"}~${f.to ?? "오늘"}`);
  if (f.q) parts.push(`검색 '${f.q}'`);
  return parts.length ? parts.join(" · ") : "거르기 없음";
}

// ── 바뀐 내용 ────────────────────────────────────────
export interface AuditEvent {
  id: string | number;
  entity_type: string;
  entity_id: string;
  field: string;
  from_value: string | null;
  to_value: string;
  actor: string;
  reason: string | null;
  created_at: string;
}

const WEIGHT_LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람", min: "최소 점수" };
export const WEIGHT_KEYS = ["age", "gender", "mbti", "interests", "wanted", "fresh"] as const;

/** 매칭 기준 이력 값(JSON). 가중치 6개 + min이 모두 0~100 숫자일 때만 받는다 */
/** 자동 메시지 문구 이력 값({"title","body"}). 둘 다 비면 '기본 문구'라는 뜻 */
export function parseTemplateValue(v: string | null | undefined): { title: string; body: string } | null {
  if (!v) return null;
  let o: unknown;
  try { o = JSON.parse(v); } catch { return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.body !== "string" || r.title.length > 200 || r.body.length > 1000) return null;
  return { title: r.title, body: r.body };
}
export const templateValue = (t: { title?: string; body?: string } | undefined) => JSON.stringify({ title: t?.title ?? "", body: t?.body ?? "" });

export function parseWeightsValue(v: string | null | undefined): { weights: Record<string, number>; min: number } | null {
  if (!v) return null;
  let o: unknown;
  try { o = JSON.parse(v); } catch { return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const ok = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100;
  if (!WEIGHT_KEYS.every((k) => ok(r[k])) || !ok(r.min)) return null;
  return { weights: Object.fromEntries(WEIGHT_KEYS.map((k) => [k, r[k] as number])), min: r.min as number };
}

/** 저장하는 매칭 기준 값. 키 순서를 고정해서 같은 값이면 같은 글자가 되게 한다 */
export const weightsValue = (weights: Record<string, number>, min: number) =>
  JSON.stringify({ ...Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Number(weights[k] ?? 0)])), min });

const weightsLine = (w: { weights: Record<string, number>; min: number }) =>
  [...WEIGHT_KEYS.map((k) => `${WEIGHT_LABEL[k]} ${w.weights[k]}`), `최소 점수 ${w.min}`].join(" · ");

function weightsChange(from: string | null, to: string): string {
  const t = parseWeightsValue(to);
  if (!t) return "매칭 기준 수정";
  const f = parseWeightsValue(from);
  if (!f) return `매칭 기준 ${weightsLine(t)}`;
  const diff = [...WEIGHT_KEYS.filter((k) => f.weights[k] !== t.weights[k]).map((k) => `${WEIGHT_LABEL[k]} ${f.weights[k]} → ${t.weights[k]}`), ...(f.min !== t.min ? [`최소 점수 ${f.min} → ${t.min}`] : [])];
  return diff.length ? `매칭 기준 ${diff.join(" · ")}` : "매칭 기준 바뀐 것 없음";
}

const clip = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 템플릿 이력 값: {"title","body"} JSON. 예전 줄은 'updated'라 내용이 없다 */
function parseTemplate(v: string | null | undefined): { title: string; body: string } | null {
  if (!v || v[0] !== "{") return null;
  try {
    const o = JSON.parse(v) as { title?: unknown; body?: unknown };
    return { title: typeof o.title === "string" ? o.title : "", body: typeof o.body === "string" ? o.body : "" };
  } catch { return null; }
}
const tplText = (s: string) => (s ? `'${clip(s)}'` : "기본 문구");

function templateChange(from: string | null, to: string, label: string): string {
  const t = parseTemplate(to);
  if (!t) return `${label} 수정`;
  const f = parseTemplate(from) ?? (from === null ? null : { title: "", body: "" });
  if (!f) return `${label} 제목 ${tplText(t.title)} · 본문 ${tplText(t.body)}`;
  const diff = [
    ...(f.title !== t.title ? [`제목 ${tplText(f.title)} → ${tplText(t.title)}`] : []),
    ...(f.body !== t.body ? [`본문 ${tplText(f.body)} → ${tplText(t.body)}`] : []),
  ];
  return diff.length ? `${label} ${diff.join(" · ")}` : `${label} 바뀐 것 없음`;
}

/** 식당 고침·엑셀 넣기 값 "이름=A; 지역=B" 둘을 칸별로 맞춰 "이름 A → C" */
function pairsChange(from: string, to: string): string | null {
  const parse = (s: string) => new Map(s.split("; ").map((x) => { const i = x.indexOf("="); return i > 0 ? [x.slice(0, i), x.slice(i + 1)] as const : ["", x] as const; }));
  const f = parse(from);
  const t = parse(to);
  if (f.has("") || t.has("")) return null;
  const keys = [...new Set([...f.keys(), ...t.keys()])];
  return keys.map((k) => `${k} ${f.get(k) || "없음"} → ${t.get(k) || "없음"}`).join(" · ");
}

/** "바뀐 칸 이전 값 → 새 값" 한 줄. templateLabel은 템플릿 키를 이름으로 (labels가 templates를 모르게 밖에서 받는다) */
export function auditChange(e: Pick<AuditEvent, "entity_type" | "field" | "from_value" | "to_value">, templateLabel?: (key: string) => string | undefined): string {
  if (e.field === "matching.weights") return weightsChange(e.from_value, e.to_value);
  if (e.field.startsWith("template:")) {
    const k = e.field.slice(9);
    return templateChange(e.from_value, e.to_value, `자동 메시지 '${templateLabel?.(k) ?? k}'`);
  }
  if (e.field === "content.rules") return "대화 콘텐츠 노출 규칙 수정";
  if ((e.field === "edit" || e.field === "import") && e.from_value) {
    const p = pairsChange(e.from_value, e.to_value);
    if (p) return `${e.field === "import" ? "엑셀로 고침" : "고침"} ${p}`;
  }
  if (e.field === "csv_export") return `CSV 내려받기 ${e.to_value}건`;
  return eventText(e);
}

// ── 개인정보 ─────────────────────────────────────────
/** 이력 문구 속 휴대폰 번호·이메일은 가려서 보여 준다: 010-****-5678, ab***@kakao.com */
export function maskText(s: string): string {
  return s
    .replace(/(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})/g, (_, a, _b, c) => `${a}-****-${c}`)
    .replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2");
}

// ── 대상 ─────────────────────────────────────────────
/** 대상 이름·링크를 만들 때 필요한 것. audit-query.ts가 한 페이지 분량만 모아서 넘긴다 */
export interface AuditContext {
  apps?: Map<string, { name: string; round?: string }>;
  users?: Map<string, { name: string; role: string; appId?: string }>;
  tables?: Map<string, string>;
  venues?: Map<string, string>;
  rooms?: Map<string, string>; // chat_room → table
  reservations?: Map<string, { tableId: string; venue?: string }>;
  templateLabel?: (key: string) => string | undefined;
}

export interface AuditTarget { kind: string; name: string; href?: string }

const ADMIN_FIELDS = new Set(["admin_level", "admin_active", "admin_account", "password_reset"]);

export function auditTarget(e: Pick<AuditEvent, "entity_type" | "entity_id" | "field">, c: AuditContext = {}): AuditTarget {
  const id = e.entity_id;
  const short = `#${id.slice(0, 6)}`;
  switch (e.entity_type) {
    case "application": {
      const a = c.apps?.get(id);
      return { kind: "신청", name: a ? `${a.name}${a.round ? ` · ${a.round}` : ""}` : short, href: `/admin/applicants/${id}` };
    }
    case "pass":
      return { kind: "이용권", name: short };
    case "dining_table":
      return { kind: "테이블", name: c.tables?.get(id) ?? short, href: `/admin/tables/${id}` };
    case "chat_room": {
      const t = c.rooms?.get(id);
      return { kind: "단체방", name: t ? c.tables?.get(t) ?? `#${t.slice(0, 6)}` : short, href: t ? `/admin/tables/${t}` : undefined };
    }
    case "venue":
      return { kind: "식당", name: c.venues?.get(id) ?? short, href: `/admin/venues/${id}` };
    case "reservation": {
      const r = c.reservations?.get(id);
      return { kind: "식당 예약", name: r?.venue ?? short, href: r ? `/admin/tables/${r.tableId}` : undefined };
    }
    case "user": {
      const u = c.users?.get(id);
      if (ADMIN_FIELDS.has(e.field) || u?.role === "admin") return { kind: "운영자 계정", name: u?.name ?? short, href: "/admin/settings#accounts" };
      return { kind: "참가자 계정", name: u?.name ?? short, href: u?.appId ? `/admin/applicants/${u.appId}` : undefined };
    }
    case "setting": {
      if (e.field.startsWith("template:")) {
        const k = e.field.slice(9);
        return { kind: "자동 메시지", name: c.templateLabel?.(k) ?? k, href: "/admin/messages" };
      }
      if (e.field.startsWith("matching.")) return { kind: "설정", name: "매칭 기준", href: "/admin/settings" };
      if (e.field.startsWith("content.")) return { kind: "설정", name: "대화 콘텐츠 규칙", href: "/admin/contents" };
      return { kind: "설정", name: fieldLabel(e.field) };
    }
    case "content":
      return { kind: "대화 콘텐츠", name: short, href: "/admin/contents" };
    case "region_demand":
      return { kind: "지역 수요", name: short, href: "/admin/demand" };
    case "exception":
      return { kind: "예외", name: short, href: "/admin/exceptions" };
    case "match_run":
      return { kind: "자동 매칭", name: short, href: "/admin/matching" };
    case "notification":
      return { kind: "알림", name: short, href: "/admin/messages" };
    case "admin_export":
      return { kind: "내려받기", name: e.field === "csv_export" ? "CSV" : fieldLabel(e.field) };
    default:
      return { kind: "기타", name: short };
  }
}

/** CSV 한 칸: 큰따옴표로 감싸고, 엑셀이 수식으로 읽지 않게 = + - @ 로 시작하면 앞에 ' 를 붙인다 */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
