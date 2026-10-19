import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Badge, Panel, Term, btnPrimary, ctl } from "@/components/admin-ui";
import { TEMPLATE_VAR } from "@/lib/admin-glossary";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { groupTemplates } from "@/lib/message-groups";
import { isFailedNotice } from "@/lib/notice-rules";
import { db } from "@/lib/supabase";
import { SAMPLE_VARS, TEMPLATES, type TemplateKey, loadTemplates, render } from "@/lib/templates";
import { saveTemplate } from "../actions";
import { MessagesHeader } from "../header";

export const dynamic = "force-dynamic";

// #tpl-키 로 들어오면 브라우저가 묶음을 먼저 펼쳐 open 값이 달라질 수 있어 details에 suppressHydrationWarning을 둔다
// 이 기간 안에 실패했거나 고친 문구가 있는 묶음은 펼쳐 둔다
const RECENT_DAYS = 7;

/** 자동 메시지 › 문구 템플릿. 비슷한 주제끼리 접어 두고, 실패·최근 수정이 있는 묶음만 펼친다 */
export default async function Templates() {
  const me = await requireAdmin();
  const ro = me.level !== "full";
  const t = await now();
  const since = new Date(t.getTime() - RECENT_DAYS * 86400_000).toISOString();
  const [tpl, { data: fails }, { data: edits }] = await Promise.all([
    loadTemplates(),
    db().from("notifications").select("template,status,last_error").gte("scheduled_at", since).or('status.eq.failed,and(status.eq.sent,last_error.like."푸시 실패*")').limit(2000),
    db().from("status_events").select("field").like("field", "template:%").gte("created_at", since).limit(500),
  ]);
  const failed: Record<string, number> = {};
  for (const n of fails ?? []) if (isFailedNotice(n)) failed[n.template] = (failed[n.template] ?? 0) + 1;
  const changed = new Set((edits ?? []).map((e) => e.field.slice("template:".length)));
  const groups = groupTemplates(Object.keys(TEMPLATES), { failed, changed });
  const custom = (k: string) => Boolean(tpl[k]?.title || tpl[k]?.body);

  return (
    <div>
      <MessagesHeader
        current="/admin/messages/templates"
        desc="자동으로 나가는 안내 문구를 주제별로 모았어요. 칸을 비워 두면 기본 문구(흐린 글씨)로 나가요."
        how={["묶음을 눌러 펼치기", "문구 고치고 미리보기 확인", "저장하면 다음 발송부터 반영"]}
      />
      <p className="mt-5 text-[13px] leading-relaxed text-muted">
        문구에 <code className="rounded bg-field px-1">{"{round}"}</code>처럼 중괄호로 감싼 말을 넣으면 보낼 때 실제 값(이 경우 회차 이름)으로 바뀌어요. 칸마다 넣을 수 있는 말이 아래에 있어요.
        최근 {RECENT_DAYS}일 안에 실패했거나 고친 문구가 있는 묶음은 펼쳐 뒀어요.
      </p>

      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <details key={g.key} id={`group-${g.key}`} open={g.open} suppressHydrationWarning className="group/tg rounded-[20px] bg-paper ring-1 ring-line/70">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[20px] px-5 py-3 hover:bg-field/60 [&::-webkit-details-marker]:hidden">
              <ChevronDown size={18} aria-hidden="true" className="shrink-0 -rotate-90 text-muted transition group-open/tg:rotate-0" />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[16px] font-bold text-ink">{g.label}</span>
                  <span className="rounded-full bg-field px-2 text-[12px] font-bold leading-[20px] text-muted tabular-nums">{g.keys.length}개</span>
                </span>
                {/* 접혀 있어도 안에 무엇이 있는지 보이게 */}
                <span className="mt-0.5 block text-[12px] text-muted group-open/tg:hidden">{g.keys.map((k) => TEMPLATES[k as TemplateKey].label).join(" · ")}</span>
              </span>
              <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                {g.failed > 0 && <Badge v={[`최근 실패 ${g.failed}건`, "danger"]} />}
                {g.changed > 0 && <Badge v={[`최근 수정 ${g.changed}개`, "accent"]} />}
              </span>
            </summary>
            <div className="grid gap-4 px-3 pb-3 pt-1 sm:px-4 lg:grid-cols-2">
              {g.keys.map((key) => {
                const d = TEMPLATES[key as TemplateKey];
                const o = tpl[key] ?? {};
                const preview = render(key as TemplateKey, SAMPLE_VARS, tpl);
                return (
                  <div key={key} id={`tpl-${key}`} className="scroll-mt-24">
                    <Panel
                      title={d.label}
                      className="h-full ring-1 ring-line/60"
                      action={
                        <span className="flex flex-wrap items-center justify-end gap-1.5 text-[12px] text-muted">
                          {failed[key] ? <Link href={`/admin/messages?tpl=${key}&st=failed#log`} className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger hover:underline">실패 {failed[key]}건</Link> : null}
                          {changed.has(key) && <Badge v={["최근 수정", "accent"]} />}
                          {custom(key) && !changed.has(key) && <Badge v={["고친 문구", "muted"]} />}
                          <span>{d.channel}</span>
                        </span>
                      }
                    >
                      <p className="text-[13px] text-muted">보내는 때: {d.when}</p>
                      <form action={saveTemplate} className="mt-3 space-y-2">
                        <input type="hidden" name="key" value={key} />
                        {d.title !== "" && <input name="title" aria-label={`${d.label} 제목`} readOnly={ro} defaultValue={o.title ?? ""} placeholder={d.title} className={`${ctl} w-full`} />}
                        <textarea name="body" aria-label={`${d.label} 내용`} readOnly={ro} defaultValue={o.body ?? ""} placeholder={d.body} rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] outline-none focus:border-accent" />
                        {d.vars.length > 0 && (
                          <div className="text-[12px] text-muted">
                            <span className="mr-1">넣을 수 있는 값</span>
                            <span className="inline-flex flex-wrap gap-1.5 align-middle">
                              {d.vars.map((v) => (
                                <span key={v} className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-0.5">
                                  <span className="text-ink2">{TEMPLATE_VAR[v] ?? "값"}</span>
                                  <Term tip={`${TEMPLATE_VAR[v] ?? "값"} 자리예요${SAMPLE_VARS[v] ? `(예: ${SAMPLE_VARS[v]})` : ""}. 문구에 이 글자를 그대로 적어 주세요.`}><code className="text-[11px]">{`{${v}}`}</code></Term>
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        <div className="rounded-xl bg-paper px-3 py-2 text-[13px]">
                          <p className="text-[11px] text-muted">미리보기 (예시 값으로 채움, 비워 두면 기본 문구)</p>
                          {preview.title && <p className="font-semibold">{preview.title}</p>}
                          <p className="whitespace-pre-line">{preview.body}</p>
                        </div>
                        {ro ? <p className="text-[12px] text-muted">조회 전용 계정이라 문구를 바꿀 수 없어요.</p> : <button className={btnPrimary}>저장</button>}
                      </form>
                    </Panel>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
