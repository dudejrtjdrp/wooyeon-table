import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, PageHeader, Panel, Term, btnInk, btnLight, ctl } from "@/components/admin-ui";
import { TableMark } from "@/components/brand";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { TABLE_TYPES, type Content, type ContentRules, loadContentRules } from "@/lib/contents";
import { TAG_NONE, TYPE_NONE, contentFiltered, contentSearch, filterContents, parseContentFilter, tagOptions, type ContentFilter } from "@/lib/content-filter";
import { DEFAULT_CUSTOM, type Pick, type Preview, TYPE_GROUPS, TYPE_NAME, customTypes, parsePreview, previewContents, previewQuery } from "@/lib/content-preview";
import { INTERESTS } from "@/lib/constants";
import { fmtSlot } from "@/lib/format";
import { TABLE, label } from "@/lib/labels";
import { pickContents } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { saveContent, saveRules, toggleContent } from "./actions";
import { ContentDialog } from "./content-dialog";

export const dynamic = "force-dynamic";

type C = { id: string; kind: string; body: string; tags: string[]; table_types: string[]; priority: number; active: boolean; updated_at: string };
type TableOpt = { id: string; label: string };

const KIND_NAME = { topic: "대화 주제", icebreaker: "아이스브레이킹" } as const;

const TIP_TAG = "참가자가 프로필에 고른 관심사예요. 주제에 같은 관심사를 붙여 두면, 그 관심사가 많이 겹친 테이블에 먼저 나가요. 예: #여행";
const TIP_TYPE = "테이블 사람들을 보고 자동으로 붙는 성격이에요. 예: 처음 온 분이 많은 테이블, 4명 테이블, 20대 중심, 차분한 분이 많은 테이블";
const TIP_PRIORITY = "보통 0이에요. 숫자가 클수록 다른 주제보다 먼저 뽑혀요. 예: +3이면 조금 먼저, -3이면 덜 나가요";
const TIP_ICE = "처음 만난 사람끼리 어색함을 푸는 짧은 놀이예요. 예: 휴대폰 최근 사진 한 장으로 자기소개하기";

/** 테이블 공통 관심사 전체 순서 (pipeline.ts pickContents와 같은 계산. 그쪽은 위 3개만 돌려줘서 여기서 다시 센다) */
async function commonInterests(tableId: string) {
  const { data } = await db().from("applications").select("users(profiles(interests))").eq("table_id", tableId).eq("match_status", "CONFIRMED");
  const count = new Map<string, number>();
  for (const m of (data ?? []) as unknown as { users: { profiles: { interests: string[] | null } | null } }[]) for (const i of m.users?.profiles?.interests ?? []) count.set(i, (count.get(i) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** 추가·고치기 공통 입력 칸 */
function ContentFields({ c, kind, here, pq, rules }: { c?: C; kind: "topic" | "icebreaker"; here: string; pq: string; rules: ContentRules }) {
  const tags = c?.tags ?? [];
  const extra = tags.filter((t) => !(INTERESTS as readonly string[]).includes(t));
  const chip = "inline-flex min-h-9 items-center rounded-full border border-line px-3 text-[13px] text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40";
  return (
    <form action={saveContent} className="space-y-5">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value={here} />
      <input type="hidden" name="pq" value={pq} />

      <label className="block">
        <span className="text-[14px] font-bold">단체방에 올라갈 문장</span>
        <span className="mt-0.5 block text-[12px] text-muted">참가자가 그대로 읽어요. 5~200자.</span>
        <textarea name="body" required minLength={5} maxLength={200} rows={3} defaultValue={c?.body} placeholder={kind === "topic" ? "예: 요즘 퇴근하고 제일 기다려지는 시간은 언제예요?" : "예: 각자 휴대폰 최근 사진 한 장으로 자기소개하기"} className={`${ctl} mt-2 h-auto w-full py-2.5`} />
      </label>

      <fieldset>
        <legend className="text-[14px] font-bold">어떤 관심사를 가진 테이블에 먼저 보낼까요? <span className="font-normal text-muted">(골라도 되고 안 골라도 돼요)</span></legend>
        <p className="mt-0.5 text-[12px] text-muted">안 고르면 모든 테이블에 나갈 수 있어요. 고르면 그 관심사가 겹친 테이블에서 점수가 올라가요.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {INTERESTS.map((t) => (
            <label key={t} className="cursor-pointer">
              <input type="checkbox" name="tags" value={t} defaultChecked={tags.includes(t)} className="peer sr-only" />
              <span className={chip}>#{t}</span>
            </label>
          ))}
        </div>
        {extra.length > 0 && (
          <label className="mt-2 block text-[12px] text-muted">목록에 없는 태그 (쉼표로 구분, 참가자 관심사와 같은 말이어야 맞춰져요)
            <input name="tags" defaultValue={extra.join(", ")} className={`${ctl} mt-1 w-full`} />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[14px] font-bold">이런 테이블에만 보내기 <span className="font-normal text-muted">(보통은 비워 둬요)</span></legend>
        <p className="mt-0.5 text-[12px] text-muted">하나라도 고르면 그 성격의 테이블에만 나가요. 하나라도 맞으면 돼요.</p>
        <div className="mt-2 space-y-2">
          {TYPE_GROUPS.map((g) => (
            <div key={g.name} className="flex flex-wrap items-center gap-1.5">
              <span className="w-12 shrink-0 text-[12px] font-semibold text-muted">{g.name}</span>
              {g.items.map((i) => (
                <label key={i.key} className="cursor-pointer" title={i.how}>
                  <input type="checkbox" name="table_types" value={i.key} defaultChecked={(c?.table_types ?? []).includes(i.key)} className="peer sr-only" />
                  <span className={chip}>{i.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-[14px] font-bold"><Term tip={TIP_PRIORITY}>우선순위</Term></span>
        <span className="mt-0.5 block text-[12px] text-muted">보통 0. 관심사가 맞으면 +{rules.interestWeight}점, 테이블 성격이 맞으면 +{rules.typeWeight}점이고, 여기 적은 숫자를 더해요. (-10~10)</span>
        <input name="priority" type="number" min={-10} max={10} defaultValue={c?.priority ?? 0} className={`${ctl} mt-2 w-28`} />
      </label>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button className={btnInk}>{c ? "저장" : "추가하기"}</button>
      </div>
    </form>
  );
}

/** 단체방 말풍선: 참가자 단체방(/tables/[id]/chat)의 시스템 메시지와 같은 모양 */
function Bubble({ message }: { message: string }) {
  const [first, ...rest] = message.split("\n");
  return (
    <div className="rounded-[20px] bg-paper p-4">
      <p className="mb-3 text-center text-[12px] font-semibold text-muted">참가자 단체방에 이렇게 보여요</p>
      <div className="flex gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-navy" aria-hidden="true"><TableMark size={22} tone="white" /></span>
        <div className="min-w-0 flex-1 overflow-hidden rounded-[6px_20px_20px_20px] bg-card shadow-sm">
          <div className="bg-navy px-4 py-3 text-paper">
            <p className="text-[12px] font-semibold text-[#e9dccb]">우연한 식탁</p>
            <p className="mt-1 text-[15px] font-bold leading-[1.45]">{first}</p>
          </div>
          <p className="whitespace-pre-line break-words px-3.5 py-3 text-[14px] leading-relaxed text-ink2">{rest.join("\n").trim()}</p>
          <p className="px-3.5 pb-2 text-right text-[11px] text-muted">모임 시작 시각</p>
        </div>
      </div>
    </div>
  );
}

function Why({ p, n }: { p: Pick; n?: number }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-text">{n ?? "·"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-snug">{p.c.body}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {p.reasons.map((r) => <span key={r.text} className="rounded-full bg-field px-2 py-0.5 text-[12px] text-ink2">{r.text} <b className="tabular-nums">{r.points > 0 ? "+" : ""}{Math.round(r.points * 10) / 10}</b></span>)}
          {!p.reasons.length && <span className="text-[12px] text-muted">모든 테이블용이라 더할 점수가 없어요. 점수가 같으면 테이블마다 다르게 섞어서 골라요.</span>}
          {p.toneFill && <Badge v={["분위기 맞춤 한 자리", "candle"]} />}
          {p.builtin && <Badge v={["기본 제공", "muted"]} />}
          {p.reasons.length > 0 && <span className="text-[12px] text-muted">합계 {p.total}점</span>}
        </div>
      </div>
    </li>
  );
}

/** 위쪽: 이 기능이 하는 일 + 테이블 미리 보기 */
function PreviewArea({ preview, tables, f, rules, result, common, types, members, posted }: {
  preview: Preview; tables: TableOpt[]; f: ContentFilter; rules: ContentRules; posted: number;
  result: ReturnType<typeof previewContents>; common: string[]; types: string[]; members: number | null;
}) {
  const keep = (["k", "q", "tag", "type", "state"] as const).map((k) => f[k] ? <input key={k} type="hidden" name={k} value={f[k]} /> : null);
  const custom = preview.mode === "custom" ? preview : DEFAULT_CUSTOM;
  const radio = "inline-flex min-h-9 items-center rounded-full border border-line px-3 text-[13px] text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40";
  return (
    <section aria-labelledby="pv-title" className="shadow-card mt-6 rounded-[20px] bg-card p-5 md:p-6">
      {/* 좁은 화면: 설명·고르기 → 말풍선 → 이유. 넓은 화면: 왼쪽 설명·이유, 오른쪽 말풍선 */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-x-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h2 id="pv-title" className="text-[19px] font-bold tracking-[-0.02em]">모임이 시작되면, 테이블에 맞는 대화 주제가 단체방에 자동으로 올라가요</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink2">
            시작 시각에 그 테이블 사람들의 관심사와 분위기를 보고, 대화 주제 {rules.topicCount}개와 <Term tip={TIP_ICE}>아이스브레이킹</Term> {rules.icebreakerCount}개를 골라 올려요. 운영자가 따로 보낼 일은 없어요. 여기서는 <b>뽑힐 후보를 관리</b>해요.
          </p>
          <p className="mt-2 rounded-xl bg-accent-soft/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink2">
            <b className="text-accent-text">예)</b> 여행을 좋아하는 사람이 많고 처음 온 분이 대부분인 4명 테이블 → <b>#여행</b>을 붙인 주제와 <b>처음 온 분이 많은 테이블</b>용 주제가 먼저 뽑혀요.
          </p>
          <p className="mt-2 text-[12px] text-muted">지금까지 단체방에 자동으로 올린 횟수 {posted}번</p>

          <h3 className="mt-6 text-[15px] font-bold">어떤 테이블로 미리 볼까요?</h3>
          <form className="mt-2 flex flex-wrap items-end gap-2" aria-label="실제 테이블로 미리 보기">
            {keep}
            <label className="block min-w-0 flex-1 basis-60">
              <span className="text-[12px] font-semibold text-muted">실제 테이블 고르기</span>
              <select name="pt" defaultValue={preview.mode === "table" ? preview.table : ""} className={`${ctl} mt-1 block w-full`} required>
                <option value="" disabled>테이블을 골라 주세요</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <button className={btnLight}>이 테이블로 보기</button>
          </form>
          {!tables.length && <p className="mt-1 text-[12px] text-muted">확정된 테이블이 아직 없어요. 아래에서 조건을 직접 정해 보세요.</p>}

          <details className="group mt-3 rounded-xl border border-line" open={preview.mode === "custom"}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-semibold text-ink2">
              또는 조건을 직접 정해서 보기
              <span aria-hidden="true" className="text-muted transition group-open:rotate-180">⌄</span>
            </summary>
            <form className="space-y-3 border-t border-line px-3.5 py-3" aria-label="조건을 정해 미리 보기">
              {keep}
              <input type="hidden" name="pv" value="custom" />
              <div>
                <p className="text-[12px] font-semibold text-muted">테이블에서 가장 많이 겹친 <Term tip={TIP_TAG}>관심사</Term></p>
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <select key={i} name="pi" aria-label={`관심사 ${i + 1}순위`} defaultValue={custom.interests[i] ?? ""} className={`${ctl} w-full`}>
                      <option value="">{i + 1}순위 없음</option>
                      {INTERESTS.map((t) => <option key={t} value={t}>{i + 1}순위 · {t}</option>)}
                    </select>
                  ))}
                </div>
              </div>
              {([
                ["pe", "경험", ["first", "regular"], custom.exp],
                ["ps", "인원", ["small", "large"], custom.size],
                ["pa", "나이", ["age20s", "age30s"], custom.age],
                ["po", "분위기", ["lively", "calm", "mixed"], custom.tone],
              ] as const).map(([name, title, keys, cur]) => (
                <fieldset key={name} className="flex flex-wrap items-center gap-1.5">
                  <legend className="sr-only">{title}</legend>
                  <span aria-hidden="true" className="w-12 shrink-0 text-[12px] font-semibold text-muted">{title}</span>
                  {keys.map((k) => (
                    <label key={k} className="cursor-pointer">
                      <input type="radio" name={name} value={k} defaultChecked={cur === k} className="peer sr-only" />
                      <span className={radio}>{TYPE_NAME[k]}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button className={btnLight}>이 조건으로 보기</button>
            </form>
          </details>

        </div>
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Bubble message={result.message} />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">올리는 중인 주제와 지금 규칙으로 고른 결과예요. 모임 시작 시각에도 똑같이 골라 올려요.</p>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <h3 className="text-[15px] font-bold">왜 이 주제들이 뽑혔나요?</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {members !== null && <>확정 {members}명 · </>}
            겹친 관심사 {common.length ? common.map((x) => `#${x}`).join(" ") : "없음"} · 테이블 성격 {types.map((t) => TYPE_NAME[t] ?? t).join(", ") || "없음"}
          </p>
          <ol className="mt-1 divide-y divide-line">
            {result.topics.map((p, i) => <Why key={p.c.id} p={p} n={i + 1} />)}
            {result.icebreakers.map((p) => <Why key={p.c.id} p={p} />)}
          </ol>
          {[...result.topics, ...result.icebreakers].some((p) => p.toneFill) && <p className="mt-1 text-[12px] text-muted"><b>분위기 맞춤 한 자리</b>: 관심사 주제만 위에 몰려도, 테이블 분위기에 맞는 주제 하나는 꼭 넣어요.</p>}
          {result.topics.some((p) => p.builtin) || result.icebreakers.some((p) => p.builtin) ? <p className="mt-1 text-[12px] text-muted"><b>기본 제공</b>: 분위기별로 늘 준비된 주제예요. 목록에서 고칠 수 없고, 같은 분위기용 주제를 추가하면 함께 겨뤄요.</p> : null}
          {result.nextTopics.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-muted hover:text-ink">아깝게 빠진 주제 보기</summary>
              <ul className="mt-1 divide-y divide-line">{result.nextTopics.map((p) => <Why key={p.c.id} p={p} />)}</ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function Contents({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const ro = me.level !== "full";
  const sp = await searchParams;
  const f = parseContentFilter(sp);
  const kind = f.k;
  const [{ data }, rules, { data: posted }, { data: trows }, clock] = await Promise.all([
    db().from("conversation_contents").select("id,kind,body,tags,table_types,priority,active,updated_at").order("active", { ascending: false }).order("priority", { ascending: false }).order("created_at"),
    loadContentRules(),
    db().from("chat_messages").select("id").eq("kind", "system").contains("meta", { type: "content" }),
    db().from("dining_tables").select("id,status,slots(starts_at,region),applications(match_status)").in("status", ["CONFIRMED", "VENUE_ASSIGNED", "READY", "IN_PROGRESS", "DONE"]).order("created_at", { ascending: false }).limit(300),
    now(),
  ]);
  const all = (data ?? []) as C[];

  // 미리 볼 테이블: 다가오는 모임부터, 그다음 지난 모임 최근 순
  const t0 = clock.getTime();
  const tables = ((trows ?? []) as unknown as { id: string; status: string; slots: { starts_at: string; region: string } | null; applications: { match_status: string }[] }[])
    .filter((t) => t.slots)
    .map((t) => ({ ...t, at: new Date(t.slots!.starts_at).getTime(), n: t.applications.filter((a) => a.match_status === "CONFIRMED").length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => (a.at >= t0) !== (b.at >= t0) ? (a.at >= t0 ? -1 : 1) : a.at >= t0 ? a.at - b.at : b.at - a.at)
    .slice(0, 40);
  const tableOpts: TableOpt[] = tables.map((t) => ({ id: t.id, label: `${fmtSlot(t.slots!.starts_at)} · ${t.slots!.region} · ${t.n}명 · ${label(TABLE, t.status)[0]}` }));

  // 미리 보기 조건. 아무것도 안 골랐으면 다가오는 첫 테이블로 보여 준다
  const explicit = Boolean(sp.pt || sp.pv);
  const asked = parsePreview(sp, INTERESTS);
  const preview: Preview = !explicit && tables[0] ? { mode: "table", table: tables[0].id } : asked.mode === "table" && !tables.some((t) => t.id === asked.table) ? DEFAULT_CUSTOM : asked;
  const pq = explicit ? previewQuery(preview) : "";

  const active = all.filter((c) => c.active) as Content[];
  let common: string[];
  let types: string[];
  let members: number | null = null;
  if (preview.mode === "table") {
    const r = { ...(await pickContents(preview.table)), tableId: preview.table };
    common = r.common;
    types = r.types;
    members = tables.find((t) => t.id === r.tableId)?.n ?? null;
  } else {
    common = preview.interests;
    types = customTypes(preview);
  }
  // pickContents와 같은 입력(공통 관심사 전체 순서·유형·규칙·테이블 id)으로 고른다. 실제 테이블은 관심사 전체 순서가 필요해 다시 센다
  const seed = preview.mode === "table" ? preview.table : "preview";
  const fullCommon = preview.mode === "table" ? await commonInterests(preview.table) : common;
  const result = previewContents(active, fullCommon, types, rules, seed);

  // 목록
  const ofKind = all.filter((c) => c.kind === kind);
  const list = filterContents(ofKind, f);
  const filtered = contentFiltered(f);
  const tags = tagOptions(ofKind);
  const count = (k2: string) => all.filter((c) => c.kind === k2 && c.active).length;
  const here = contentSearch(f);
  const withPv = (q: string) => (pq ? `${q}&${pq}` : q);

  return (
    <div>
      <PageHeader
        title="대화 콘텐츠"
        desc="모임 시작 때 단체방에 자동으로 올라가는 대화 주제를 관리해요."
        how={["주제 추가하기", "안 쓰는 주제는 멈추기", "테이블별로 뭐가 나갈지 미리 보기"]}
      />

      <PreviewArea preview={preview} tables={tableOpts} f={f} rules={rules} result={result} common={common} types={types} members={members} posted={posted?.length ?? 0} />

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-[19px] font-bold tracking-[-0.02em]">후보 목록</h2>
            {(["topic", "icebreaker"] as const).map((x) => (
              <Link key={x} href={`/admin/contents${withPv(contentSearch({ k: x, q: f.q, type: f.type, state: f.state }))}`} aria-current={kind === x ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-semibold ${kind === x ? "bg-ink text-white" : "bg-card text-muted"}`}>
                {KIND_NAME[x]} <span className="ml-1 tabular-nums opacity-70">{count(x)}</span>
              </Link>
            ))}
            {!ro && (
              <span className="ml-auto">
                <ContentDialog
                  label={<><Plus size={18} aria-hidden="true" />{kind === "topic" ? "주제 추가" : "아이스브레이킹 추가"}</>}
                  title={kind === "topic" ? "대화 주제 추가" : "아이스브레이킹 추가"}
                  desc="추가하면 바로 후보가 돼요. 다음 모임부터 뽑힐 수 있어요."
                  triggerClass={btnInk}
                >
                  <ContentFields kind={kind} here={here} pq={pq} rules={rules} />
                </ContentDialog>
              </span>
            )}
          </div>
          {kind === "icebreaker" && <p className="text-[13px] text-muted">아이스브레이킹은 처음 만난 사람끼리 어색함을 푸는 짧은 놀이예요. 대화 주제 아래에 {rules.icebreakerCount}개 붙어서 나가요.</p>}

          {/* 검색·거르기: 주소에 남아 새로 고침·저장 뒤에도 그대로 */}
          <form role="search" aria-label="콘텐츠 찾기" className="flex flex-wrap items-end gap-2 rounded-2xl bg-card p-4">
            <input type="hidden" name="k" value={kind} />
            {pq && [...new URLSearchParams(pq)].map(([k, v], i) => <input key={`${k}${i}`} type="hidden" name={k} value={v} />)}
            <label className="block min-w-0 flex-1 basis-48"><span className="text-[12px] font-semibold text-muted">문장·관심사로 찾기</span><input name="q" defaultValue={f.q} placeholder="예: 여행, 퇴근" className={`${ctl} mt-1 w-full`} /></label>
            <label className="block"><span className="text-[12px] font-semibold text-muted"><Term tip={TIP_TAG}>관심사</Term></span>
              <select name="tag" defaultValue={f.tag ?? ""} className={`${ctl} mt-1 block max-w-44`}><option value="">전체</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}<option value={TAG_NONE}>안 붙인 것(모든 관심사)</option></select>
            </label>
            <label className="block"><span className="text-[12px] font-semibold text-muted"><Term tip={TIP_TYPE}>테이블 성격</Term></span>
              <select name="type" defaultValue={f.type ?? ""} className={`${ctl} mt-1 block max-w-44`}><option value="">전체</option>{TABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAME[t]}</option>)}<option value={TYPE_NONE}>안 정한 것(모든 테이블)</option></select>
            </label>
            <label className="block"><span className="text-[12px] font-semibold text-muted">상태</span>
              <select name="state" defaultValue={f.state ?? ""} className={`${ctl} mt-1 block`}><option value="">전체</option><option value="on">올리는 중</option><option value="off">멈춤</option></select>
            </label>
            <button className={btnLight}>찾기</button>
            {filtered && <Link href={`/admin/contents${withPv(`?k=${kind}`)}`} className="inline-flex h-11 items-center px-2 text-[13px] font-semibold text-muted hover:text-ink">거르기 풀기</Link>}
            {filtered && <p className="w-full text-[13px] text-muted" aria-live="polite">{ofKind.length}개 중 {list.length}개</p>}
          </form>

          {ro && <p className="rounded-xl bg-field px-4 py-3 text-[13px] text-muted">조회 전용 계정이라 콘텐츠와 규칙을 볼 수만 있어요.</p>}

          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id} className={`flex items-start gap-3 rounded-2xl bg-card p-4 ${c.active ? "" : "bg-card/60"}`}>
                <div className={`min-w-0 flex-1 ${c.active ? "" : "opacity-55"}`}>
                  <p className="text-[15px] leading-snug">{c.body}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1">
                    {(c.tags ?? []).length ? c.tags.map((t) => <Badge key={t} v={[`#${t}`, "accent"]} />) : <Badge v={["모든 관심사", "muted"]} />}
                    {(c.table_types ?? []).length ? c.table_types.map((t) => <Badge key={t} v={[`${TYPE_NAME[t] ?? t}만`, "candle"]} />) : null}
                    {c.priority ? <Badge v={[`우선순위 ${c.priority > 0 ? "+" : ""}${c.priority}`, "ink"]} /> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {ro ? (
                    <Badge v={c.active ? ["올리는 중", "leaf"] : ["멈춤", "muted"]} />
                  ) : (
                    <>
                      <form action={toggleContent}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(!c.active)} />
                        <input type="hidden" name="back" value={here} />
                        <input type="hidden" name="pq" value={pq} />
                        <button aria-pressed={c.active} aria-label={`${c.active ? "멈추기" : "다시 올리기"}: ${c.body.slice(0, 30)}`} title={c.active ? "누르면 더는 뽑히지 않아요" : "누르면 다시 후보가 돼요"} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-[13px] font-semibold text-muted hover:bg-field">
                          <span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition ${c.active ? "bg-accent" : "bg-line"}`}>
                            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${c.active ? "left-[18px]" : "left-0.5"}`} />
                          </span>
                          <span className={`w-14 text-left ${c.active ? "text-accent-text" : ""}`}>{c.active ? "올리는 중" : "멈춤"}</span>
                        </button>
                      </form>
                      <ContentDialog label="고치기" title={`${KIND_NAME[c.kind as "topic"] ?? "콘텐츠"} 고치기`} triggerLabel={`고치기: ${c.body.slice(0, 30)}`} triggerClass="min-h-11 rounded-xl px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft/50">
                        <ContentFields c={c} kind={c.kind === "icebreaker" ? "icebreaker" : "topic"} here={here} pq={pq} rules={rules} />
                      </ContentDialog>
                    </>
                  )}
                </div>
              </li>
            ))}
            {!list.length && <li className="shadow-card rounded-[20px] bg-card p-10 text-center text-muted">{filtered && ofKind.length ? <>찾는 조건에 맞는 콘텐츠가 없어요. <Link href={`/admin/contents${withPv(`?k=${kind}`)}`} className="font-semibold text-accent underline underline-offset-4">거르기 풀기</Link></> : "등록된 콘텐츠가 없어요."}</li>}
          </ul>
        </div>

        <div className="space-y-4">
          <Panel title="몇 개를, 무엇을 보고 고를까">
            <form action={saveRules} className="space-y-4 text-[14px]">
              <input type="hidden" name="back" value={here} />
              <input type="hidden" name="pq" value={pq} />
              <label className="flex items-center justify-between gap-3"><span>대화 주제 개수 <span className="block text-[12px] text-muted">3~6개</span></span><input name="topicCount" type="number" min={3} max={6} defaultValue={rules.topicCount} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3"><span>아이스브레이킹 개수 <span className="block text-[12px] text-muted">1~3개</span></span><input name="icebreakerCount" type="number" min={1} max={3} defaultValue={rules.icebreakerCount} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3"><span>관심사가 맞을 때 점수 <span className="block text-[12px] text-muted">클수록 관심사 주제가 먼저 (0~30)</span></span><input name="interestWeight" type="number" min={0} max={30} defaultValue={rules.interestWeight} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3"><span>테이블 성격이 맞을 때 점수 <span className="block text-[12px] text-muted">클수록 성격 맞춤 주제가 먼저 (0~30)</span></span><input name="typeWeight" type="number" min={0} max={30} defaultValue={rules.typeWeight} className={`${ctl} w-20`} /></label>
              {ro ? <p className="text-[12px] text-muted">조회 전용 계정이라 바꿀 수 없어요.</p> : <button className={btnLight}>저장</button>}
              <p className="text-[12px] text-muted">저장하면 위 미리 보기도 바로 바뀌어요.</p>
            </form>
          </Panel>
          <Panel title="이렇게 골라요">
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
              <li>올리는 중인 것 중, 테이블 성격을 안 정했거나 성격이 맞는 것만 후보예요.</li>
              <li>테이블에서 많이 겹친 관심사가 붙어 있으면 +{rules.interestWeight}점(2순위 관심사는 조금 덜).</li>
              <li>테이블 성격이 맞으면 하나당 +{rules.typeWeight}점, 그리고 우선순위를 더해요.</li>
              <li>점수 높은 순으로 고르되, 테이블 분위기에 맞는 주제 하나는 꼭 넣어요.</li>
              <li>점수가 같으면 테이블마다 다르게 섞어서, 같은 날 여러 테이블이 똑같은 주제를 받지 않아요.</li>
            </ol>
            <ul className="mt-3 space-y-1 text-[12px] text-muted">
              {TYPE_GROUPS.map((g) => <li key={g.name}><b className="text-ink2">{g.name}</b>: {g.items.map((i) => `${i.label}(${i.how})`).join(", ")}</li>)}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
