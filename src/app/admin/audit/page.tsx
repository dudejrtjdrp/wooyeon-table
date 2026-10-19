import { Download } from "lucide-react";
import { reasonText } from "@/lib/admin-glossary";
import Link from "next/link";
import { PageHeader, Term, btn, btnLight, ctl, td, th } from "@/components/admin-ui";
import { AUDIT_KINDS, AUDIT_PAGE_SIZE, auditChange, auditSearch, auditTarget, maskText, parseAuditFilter, parseTemplateValue, parseWeightsValue, templateValue } from "@/lib/audit";
import { auditContext, currentWeightsValue, loadAudit, templateLabel } from "@/lib/audit-query";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { actorLabel } from "@/lib/labels";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../confirm-button";
import { restoreTemplate, restoreWeights } from "./actions";
import { loadTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

/** 전체 변경 이력: 누가·언제·무엇을·왜 바꿨는지 (PRD 16장 주요 변경 이력, A5) */
export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const f = parseAuditFilter(await searchParams);
  const [{ rows, total }, { data: admins }, curWeights, curTemplates] = await Promise.all([
    loadAudit(f),
    db().from("users").select("id,name").eq("role", "admin").is("deleted_at", null).order("created_at"),
    currentWeightsValue(),
    loadTemplates(),
  ]);
  const { ctx, adminNames } = await auditContext(rows);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const here = `/admin/audit${auditSearch(f)}`;
  const filtered = Boolean(f.kind || f.actor || f.from || f.to || f.q);
  const canRestore = me.level === "full";

  return (
    <div>
      <PageHeader
        title="변경 이력"
        desc="누가 언제 무엇을 바꿨는지 한곳에서 봐요. 운영자가 바꾼 것뿐 아니라 자동 처리와 참가자가 바꾼 것도 남아요."
        how={["대상·누가·기간으로 거르기", "대상 이름을 눌러 그 화면으로 가기", "매칭 기준·자동 메시지 문구는 줄 안의 버튼으로 되돌리기"]}
        actions={
          <a href={`/api/admin/audit${auditSearch(f, 1)}`} className={btnLight} download>
            <Download size={16} />CSV 내려받기
          </a>
        }
      />

      <form className="shadow-card mt-6 grid gap-3 rounded-[20px] bg-card p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">대상</span>
          <select name="kind" defaultValue={f.kind ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">전체</option>
            {AUDIT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">누가</span>
          <select name="actor" defaultValue={f.actor ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">전체</option>
            <option value="admin">운영자 전체</option>
            {(admins ?? []).map((a) => <option key={a.id} value={`admin:${a.id}`}>운영자 {a.name}</option>)}
            <option value="system">자동(시스템)</option>
            <option value="user">참가자</option>
          </select>
        </label>
        <div className="block">
          <span className="text-[13px] font-semibold text-ink">기간</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input type="date" name="from" defaultValue={f.from} aria-label="시작 날짜" className={`${ctl} min-w-0 flex-1 px-2`} />
            <span className="text-muted">~</span>
            <input type="date" name="to" defaultValue={f.to} aria-label="끝 날짜" className={`${ctl} min-w-0 flex-1 px-2`} />
          </div>
        </div>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">검색</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="이름·식당·사유" className={`${ctl} mt-1.5 w-full`} />
        </label>
        <div className="flex items-end gap-2">
          <button className={`${btn} bg-accent text-white`}>거르기</button>
          {filtered && <Link href="/admin/audit" className={btnLight}>처음으로</Link>}
        </div>
      </form>

      <p className="mt-5 text-[14px] text-muted">
        {total === 0 ? (filtered ? "조건에 맞는 이력이 없어요. 거르기를 바꿔 보세요." : "아직 남은 이력이 없어요.") : `모두 ${total.toLocaleString("ko-KR")}건 · 최신순`}
      </p>

      {rows.length > 0 && (
        <div className="shadow-card mt-3 overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
          <table className="w-full min-w-[980px] text-[14px]">
            <thead className="border-b border-line">
              <tr>{["언제", "누가", "대상", "바뀐 내용", "사유"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {rows.map((e) => {
                const t = auditTarget(e, ctx);
                const w = e.field === "matching.weights";
                const tk = e.field?.startsWith("template:") ? e.field.slice("template:".length) : null;
                const curTpl = tk ? templateValue(curTemplates[tk]) : null;
                const okTpl = (v: string | null) => { const x = parseTemplateValue(v); return !!x && templateValue(x) !== curTpl; };
                const canTo = canRestore && (w ? parseWeightsValue(e.to_value) && e.to_value !== curWeights : tk ? okTpl(e.to_value) : false);
                const canFrom = canRestore && (w ? parseWeightsValue(e.from_value) && e.from_value !== curWeights : tk ? okTpl(e.from_value) : false);
                const restore = w ? restoreWeights : restoreTemplate;
                const what = w ? "매칭 기준을" : "이 자동 메시지 문구를";
                const after = w ? "다음 자동 매칭부터 이 기준을 써요." : "다음 발송부터 이 문구로 나가요.";
                return (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap text-muted tabular-nums`}>{fmtDateTime(e.created_at)}</td>
                    <td className={`${td} whitespace-nowrap`}>{actorLabel(e.actor, adminNames)}</td>
                    <td className={td}>
                      <span className="block text-[12px] text-muted">{t.kind}</span>
                      {t.href ? <Link href={t.href} className="font-semibold text-accent underline-offset-4 hover:underline">{t.name}</Link> : <span className="font-semibold text-ink">{t.name.startsWith("#") ? <Term tip="이름이 없는 기록이라 기록 번호 앞 여섯 자리로 보여 줘요.">{t.name}</Term> : t.name}</span>}
                    </td>
                    <td className={`${td} max-w-[380px] break-words text-ink`}>
                      {maskText(auditChange(e, templateLabel))}
                      {(canTo || canFrom) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canTo && (
                            <form action={restore}>
                              <input type="hidden" name="event_id" value={String(e.id)} />
                              <input type="hidden" name="which" value="to" />
                              <input type="hidden" name="back" value={here} />
                              <ConfirmButton confirm={`${what} 이 값(바꾼 뒤)으로 되돌릴까요? ${after}`} className={`${btnLight} h-11`}>이 값으로 되돌리기</ConfirmButton>
                            </form>
                          )}
                          {canFrom && (
                            <form action={restore}>
                              <input type="hidden" name="event_id" value={String(e.id)} />
                              <input type="hidden" name="which" value="from" />
                              <input type="hidden" name="back" value={here} />
                              <ConfirmButton confirm={`${what} 이 변경 전 값으로 되돌릴까요? ${after}`} className={`${btnLight} h-11`}>바꾸기 전으로 되돌리기</ConfirmButton>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${td} max-w-[280px] break-words text-muted`}>{reasonText(e.reason) ? maskText(reasonText(e.reason)!) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="페이지" className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {f.page > 1 ? <Link href={`/admin/audit${auditSearch(f, f.page - 1)}`} className={btnLight}>이전</Link> : <span className={`${btnLight} pointer-events-none opacity-40`}>이전</span>}
          <span className="px-3 text-[14px] tabular-nums text-muted">{f.page} / {pages}쪽</span>
          {f.page < pages ? <Link href={`/admin/audit${auditSearch(f, f.page + 1)}`} className={btnLight}>다음</Link> : <span className={`${btnLight} pointer-events-none opacity-40`}>다음</span>}
        </nav>
      )}
      <p className="mt-4 text-[12px] text-muted">
        이력 문구 속 휴대폰 번호와 이메일은 가려서 보여 줘요. CSV에는 지금 거른 조건 그대로 최대 5,000건이 담기고, 내려받은 기록도 이 이력에 남아요.
      </p>
    </div>
  );
}
