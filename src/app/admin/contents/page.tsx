import Link from "next/link";
import { Badge, PageHeader, Panel, btnInk, btnLight, ctl } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { TABLE_TYPES, TYPE_LABEL, loadContentRules } from "@/lib/contents";
import { INTERESTS } from "@/lib/constants";
import { db } from "@/lib/supabase";
import { saveContent, saveRules, toggleContent } from "./actions";

export const dynamic = "force-dynamic";

type C = { id: string; kind: string; body: string; tags: string[]; table_types: string[]; priority: number; active: boolean; updated_at: string };

function TypeChecks({ value = [] }: { value?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABLE_TYPES.map((t) => (
        <label key={t} className="cursor-pointer">
          <input type="checkbox" name="table_types" value={t} defaultChecked={value.includes(t)} className="peer sr-only" />
          <span className="inline-block rounded-full border border-line px-2.5 py-1 text-[12px] text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent">{TYPE_LABEL[t]}</span>
        </label>
      ))}
    </div>
  );
}

export default async function Contents({ searchParams }: { searchParams: Promise<{ k?: string; m?: string; e?: string }> }) {
  await requireAdmin();
  const { k, m, e } = await searchParams;
  const kind = k === "icebreaker" ? "icebreaker" : "topic";
  const [{ data }, rules, { data: posted }] = await Promise.all([
    db().from("conversation_contents").select("id,kind,body,tags,table_types,priority,active,updated_at").order("active", { ascending: false }).order("priority", { ascending: false }).order("created_at"),
    loadContentRules(),
    db().from("chat_messages").select("id").eq("kind", "system").contains("meta", { type: "content" }),
  ]);
  const all = (data ?? []) as C[];
  const list = all.filter((c) => c.kind === kind);
  const count = (k2: string) => all.filter((c) => c.kind === k2 && c.active).length;

  return (
    <div>
      <PageHeader
        title="대화 콘텐츠"
        desc="모임 시작 시각에 단체방에 자동으로 올라가는 대화 주제와 아이스브레이킹이에요. 테이블의 공통 관심사와 유형에 맞는 것부터 골라요."
      />
      {m && <p className="mt-4 rounded-xl bg-leaf/10 px-4 py-3 text-[14px] font-medium text-leaf">{m}</p>}
      {e && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">{e}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(["topic", "icebreaker"] as const).map((x) => (
              <Link key={x} href={`/admin/contents?k=${x}`} className={`rounded-full px-4 py-2 text-[14px] font-semibold ${kind === x ? "bg-ink text-white" : "bg-card text-muted"}`}>
                {x === "topic" ? "대화 주제" : "아이스브레이킹"} <span className="ml-1 tabular-nums opacity-70">{count(x)}</span>
              </Link>
            ))}
            <span className="ml-auto text-[13px] text-muted">지금까지 자동 게시 {posted?.length ?? 0}회</span>
          </div>

          <Panel title={kind === "topic" ? "새 대화 주제" : "새 아이스브레이킹"}>
            <form action={saveContent} className="space-y-3">
              <input type="hidden" name="kind" value={kind} />
              <textarea name="body" required rows={2} maxLength={200} placeholder={kind === "topic" ? "예: 요즘 퇴근하고 제일 기다려지는 시간은 언제예요?" : "예: 각자 휴대폰 최근 사진 한 장으로 자기소개하기"} className={`${ctl} h-auto w-full py-2.5`} />
              <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                <label className="block text-[12px] font-semibold text-muted">관심사 태그 (쉼표로 구분, 비우면 모든 테이블)
                  <input name="tags" list="interest-list" placeholder="여행, 맛집 탐방" className={`${ctl} mt-1 w-full font-normal text-ink`} />
                </label>
                <label className="block text-[12px] font-semibold text-muted">우선순위
                  <input name="priority" type="number" min={-10} max={10} defaultValue={0} className={`${ctl} mt-1 w-full font-normal text-ink`} />
                </label>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-muted">노출할 테이블 유형 (비우면 모든 유형)</p>
                <TypeChecks />
              </div>
              <button className={btnInk}>등록</button>
            </form>
            <datalist id="interest-list">{INTERESTS.map((i) => <option key={i} value={i} />)}</datalist>
          </Panel>

          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id} className={`rounded-2xl bg-card p-4 ${c.active ? "" : "opacity-55"}`}>
                <details>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[15px] leading-snug">{c.body}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {(c.tags ?? []).length ? c.tags.map((t) => <Badge key={t} v={[`#${t}`, "accent"]} />) : <Badge v={["모든 관심사", "muted"]} />}
                        {(c.table_types ?? []).map((t) => <Badge key={t} v={[TYPE_LABEL[t] ?? t, "candle"]} />)}
                        {c.priority ? <Badge v={[`우선 ${c.priority > 0 ? "+" : ""}${c.priority}`, "ink"]} /> : null}
                        {!c.active && <Badge v={["노출 중지", "danger"]} />}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted">고치기</span>
                  </summary>
                  <form action={saveContent} className="mt-3 space-y-3 border-t border-line pt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="kind" value={c.kind} />
                    <textarea name="body" defaultValue={c.body} rows={2} maxLength={200} className={`${ctl} h-auto w-full py-2.5`} />
                    <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                      <input name="tags" list="interest-list" defaultValue={(c.tags ?? []).join(", ")} placeholder="관심사 태그" className={ctl} />
                      <input name="priority" type="number" min={-10} max={10} defaultValue={c.priority ?? 0} className={ctl} />
                    </div>
                    <TypeChecks value={c.table_types ?? []} />
                    <div className="flex gap-2">
                      <button className={btnInk}>저장</button>
                    </div>
                  </form>
                </details>
                <form action={toggleContent} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(!c.active)} />
                  <button className="text-[12px] font-semibold text-muted hover:text-ink">{c.active ? "노출 멈추기" : "다시 노출하기"}</button>
                </form>
              </li>
            ))}
            {!list.length && <li className="shadow-card rounded-[20px] bg-card p-10 text-center text-muted">등록된 콘텐츠가 없어요.</li>}
          </ul>
        </div>

        <div className="space-y-4">
          <Panel title="노출 규칙">
            <form action={saveRules} className="space-y-3 text-[14px]">
              <label className="flex items-center justify-between gap-3">대화 주제 개수 <input name="topicCount" type="number" min={3} max={6} defaultValue={rules.topicCount} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3">아이스브레이킹 개수 <input name="icebreakerCount" type="number" min={1} max={3} defaultValue={rules.icebreakerCount} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3">공통 관심사 가중치 <input name="interestWeight" type="number" min={0} max={30} defaultValue={rules.interestWeight} className={`${ctl} w-20`} /></label>
              <label className="flex items-center justify-between gap-3">테이블 유형 가중치 <input name="typeWeight" type="number" min={0} max={30} defaultValue={rules.typeWeight} className={`${ctl} w-20`} /></label>
              <button className={btnLight}>규칙 저장</button>
            </form>
          </Panel>
          <Panel title="이렇게 골라요">
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
              <li>노출 중인 콘텐츠 중 테이블 유형이 맞거나 유형을 정하지 않은 것만 후보가 돼요.</li>
              <li>테이블 사람들이 가장 많이 겹친 관심사 태그일수록 점수가 높아요.</li>
              <li>유형이 맞으면 유형 가중치, 우선순위 값을 더해요.</li>
              <li>점수가 같으면 테이블마다 다르게 섞여서, 같은 날 여러 테이블이 똑같은 주제를 받지 않아요.</li>
            </ol>
            <p className="mt-3 text-[12px] text-muted">테이블 유형: 첫 참가 위주/재방문 위주는 이전 참석 기록, 4인/5~6인은 인원, 20대/30대 이상은 평균 나이로 정해요. 테이블 상세에서 실제로 나갈 콘텐츠를 미리 볼 수 있어요.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
