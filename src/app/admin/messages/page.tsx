import Link from "next/link";
import { Badge, PageHeader, Panel, Stat, Term, btnLight, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { TEMPLATE_VAR } from "@/lib/admin-glossary";
import { Required } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtSlot } from "@/lib/format";
import { NOTICE } from "@/lib/labels";
import { escapeLike, maskPhone, parseMemberQuery } from "@/lib/members";
import { LOG_PAGE_SIZE, LOG_STATUS, NOTICE_BODY_MAX, NOTICE_SCOPES, NOTICE_TITLE_MAX, type NoticeScope, isFailedNotice, logRange, logSearch, pageCount, parseLogFilter, parseScope } from "@/lib/notice-rules";
import { db } from "@/lib/supabase";
import { SAMPLE_VARS, TEMPLATES, loadTemplates, render } from "@/lib/templates";
import { ConfirmButton } from "../confirm-button";
import { resendNotice, saveTemplate, sendAnnouncement } from "./actions";
import { loadNoticeTarget } from "./notice-data";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kindLabel = (k: string) => (TEMPLATES as Record<string, { label: string }>)[k]?.label ?? NOTICE[k] ?? "기타 알림";
const KINDS = [...new Set([...Object.keys(TEMPLATES), ...Object.keys(NOTICE)])];

/** 공지 보내기: 대상 고르기 → 받는 사람 수 미리 보기 → 문구 쓰고 확인 후 보내기 */
async function NoticePanel({ sp, ro }: { sp: SP; ro: boolean }) {
  const ns: NoticeScope = parseScope(one(sp, "ns")) ?? "round";
  const nr = one(sp, "nr");
  const nt = one(sp, "nt");
  const nq = one(sp, "nq");
  const nm = one(sp, "nm");
  const roundId = nr && UUID.test(nr) ? nr : undefined;
  const { data: rounds } = await db().from("rounds").select("id,title,status").order("match_at", { ascending: false }).limit(30);
  const { data: tables } = ns === "table" && roundId
    ? await db().from("dining_tables").select("id,status,slots(starts_at,region),venues(name)").eq("round_id", roundId).limit(200)
    : { data: [] };
  const tbs = ((tables ?? []) as unknown as { id: string; status: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null }[])
    .sort((a, b) => (a.slots?.starts_at ?? "").localeCompare(b.slots?.starts_at ?? ""));
  const mq = ns === "member" && !nm ? parseMemberQuery(nq) : { kind: "empty" as const };
  const base = () => db().from("users").select("id,name,phone").eq("role", "user").is("deleted_at", null).order("created_at", { ascending: false }).limit(10);
  const found = mq.kind === "phone4" ? (await base().like("phone", `%${mq.digits}`)).data
    : mq.kind === "phone" ? (await base().eq("phone", mq.digits)).data
    : mq.kind === "text" ? (await base().ilike("name", `%${escapeLike(mq.text)}%`)).data
    : [];

  const targetId = ns === "round" ? roundId : ns === "table" ? (nt && UUID.test(nt) ? nt : undefined) : nm && UUID.test(nm) ? nm : undefined;
  const target = targetId ? await loadNoticeTarget(ns, targetId) : null;
  const here = new URLSearchParams();
  here.set("ns", ns);
  if (roundId) here.set("nr", roundId);
  if (ns === "table" && nt) here.set("nt", nt);
  if (ns === "member" && nm) here.set("nm", nm);
  const back = `/admin/messages?${here.toString()}#notice`;

  return (
    <Panel title="공지 보내기" action={<span className="text-[12px] text-muted">푸시·알림함</span>}>
      <div id="notice" className="scroll-mt-24" />
      <p className="text-[13px] text-muted">회차 신청자, 테이블, 회원 한 명에게 짧은 공지를 보내요. 보내기 전에 받는 사람 수를 먼저 보여 드려요. 같은 대상에게 같은 공지는 한 번만 나가요.</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" action="/admin/messages#notice">
        <label className="text-[13px] text-muted">
          받는 사람
          <select name="ns" defaultValue={ns} className={`${ctl} mt-1 block`}>
            {Object.entries(NOTICE_SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {ns !== "member" ? (
          <label className="text-[13px] text-muted">
            회차
            <select name="nr" defaultValue={roundId ?? ""} className={`${ctl} mt-1 block max-w-[260px]`}>
              <option value="">회차를 골라 주세요</option>
              {(rounds ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-[13px] text-muted">
            회원
            <input name="nq" defaultValue={nq ?? ""} placeholder="이름, 연락처 뒤 4자리" className={`${ctl} mt-1 block w-60`} />
          </label>
        )}
        {ns === "table" && roundId && (
          <label className="text-[13px] text-muted">
            테이블
            <select name="nt" defaultValue={nt ?? ""} className={`${ctl} mt-1 block max-w-[300px]`}>
              <option value="">테이블을 골라 주세요</option>
              {tbs.map((t) => <option key={t.id} value={t.id}>{t.slots ? `${fmtSlot(t.slots.starts_at)} ${t.slots.region}` : "테이블"}{t.venues ? ` · ${t.venues.name}` : ""}</option>)}
            </select>
          </label>
        )}
        <button className={btnLight}>{ns === "member" ? "찾기" : ns === "table" && roundId ? "대상 보기" : ns === "table" ? "테이블 고르기" : "대상 보기"}</button>
      </form>
      {ns === "table" && roundId && !tbs.length && <p className="mt-2 text-[13px] text-muted">이 회차에는 아직 테이블이 없어요.</p>}

      {ns === "member" && !nm && nq && (
        <ul className="mt-3 divide-y divide-line rounded-xl bg-paper px-3">
          {(found ?? []).map((u) => (
            <li key={u.id}>
              <Link href={`/admin/messages?ns=member&nm=${u.id}#notice`} className="flex min-h-11 items-center gap-3 text-[14px] hover:text-accent">
                <span className="font-semibold">{u.name}</span><span className="tabular-nums text-muted">{maskPhone(u.phone)}</span>
              </Link>
            </li>
          ))}
          {!found?.length && <li className="py-3 text-[13px] text-muted">맞는 회원이 없어요. 두 글자 이상이나 연락처 뒤 4자리로 찾아 주세요.</li>}
        </ul>
      )}

      {target && !target.ok && <p className="mt-3 text-[13px] text-danger">{target.message}</p>}
      {target?.ok && (
        <div className="mt-4 rounded-xl bg-paper p-4">
          <p className="text-[14px]">
            <b>{target.label}</b> · 받는 사람 <b className="tabular-nums">{target.userIds.length}명</b>
          </p>
          {target.userIds.length > 0 ? (
            <p className="mt-0.5 text-[13px] text-muted">{target.names.slice(0, 8).join(", ")}{target.names.length > 8 ? ` 외 ${target.names.length - 8}명` : ""}</p>
          ) : (
            <p className="mt-0.5 text-[13px] text-muted">{ns === "table" ? "지금 이 테이블에 확정된 사람이 없어요." : ns === "round" ? "이 회차에 신청서를 낸 사람이 없어요." : "탈퇴한 회원이라 보낼 수 없어요."}</p>
          )}
          {ro ? <p className="mt-3 text-[12px] text-muted">조회 전용 계정이라 공지를 보낼 수 없어요.</p> : target.userIds.length > 0 && (
            <form action={sendAnnouncement} className="mt-3 space-y-2">
              <input type="hidden" name="scope" value={ns} />
              <input type="hidden" name="target" value={targetId} />
              <input type="hidden" name="expect" value={target.userIds.length} />
              <input type="hidden" name="back" value={back} />
              <label className="block text-[13px] text-muted">
                제목<Required />
                <input name="title" required minLength={2} maxLength={NOTICE_TITLE_MAX} placeholder="예: 이번 주 모임 장소 안내" className={`${ctl} mt-1 w-full`} />
              </label>
              <label className="block text-[13px] text-muted">
                내용<Required /> <span className="text-[12px]">(한 줄, {NOTICE_BODY_MAX}자까지)</span>
                <input name="body" required minLength={4} maxLength={NOTICE_BODY_MAX} placeholder="예: 식당 입구가 공사 중이라 옆문으로 들어와 주세요" className={`${ctl} mt-1 w-full`} />
              </label>
              <ConfirmButton confirm={`${target.label} ${target.userIds.length}명에게 공지를 보내요. 보낸 공지는 되돌릴 수 없어요. 보낼까요?`} className={btnPrimary}>
                {target.userIds.length}명에게 보내기
              </ConfirmButton>
            </form>
          )}
        </div>
      )}
    </Panel>
  );
}

export default async function Messages({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin();
  const ro = me.level !== "full";
  const sp = await searchParams;
  const f = parseLogFilter(sp, new Set(KINDS));
  const tpl = await loadTemplates();

  // 받는 사람 이름으로 찾으면 먼저 그 사람들의 id를 찾는다
  const { data: who } = f.q ? await db().from("users").select("id").ilike("name", `%${escapeLike(f.q)}%`).limit(200) : { data: null };
  const { since, until } = logRange(f);
  let q = db()
    .from("notifications")
    .select("id,template,title,status,attempts,last_error,scheduled_at,sent_at,users(name)", { count: "exact" })
    .order("scheduled_at", { ascending: false })
    .range((f.page - 1) * LOG_PAGE_SIZE, f.page * LOG_PAGE_SIZE - 1);
  if (who) q = q.in("user_id", who.length ? who.map((x) => x.id) : ["00000000-0000-0000-0000-000000000000"]);
  if (f.tpl) q = q.eq("template", f.tpl);
  if (f.st === "pending") q = q.eq("status", "pending");
  if (f.st === "sent") q = q.eq("status", "sent").or('last_error.is.null,last_error.not.like."푸시 실패*"');
  if (f.st === "failed") q = q.or('status.eq.failed,and(status.eq.sent,last_error.like."푸시 실패*")');
  if (since) q = q.gte("scheduled_at", since);
  if (until) q = q.lt("scheduled_at", until);
  const head = () => db().from("notifications").select("id", { count: "exact", head: true });
  const [{ data: log, count: total }, { count: nSent }, { count: nPending }, { count: nFailed }] = await Promise.all([
    q,
    head().eq("status", "sent"),
    head().eq("status", "pending"),
    head().or('status.eq.failed,and(status.eq.sent,last_error.like."푸시 실패*")'),
  ]);
  const rows = (log ?? []) as unknown as { id: string; template: string; title: string; status: string; attempts: number; last_error: string | null; scheduled_at: string; sent_at: string | null; users: { name: string } | null }[];
  const pages = pageCount(total ?? 0);
  const filtered = Boolean(f.q || f.tpl || f.st || f.from || f.to);
  const here = `/admin/messages${logSearch(f)}#log`;

  return (
    <div>
      <PageHeader
        title="자동 메시지"
        desc="자동으로 나가는 안내 문구를 고치고, 언제 누구에게 나갔는지 확인해요. 실패하면 세 번까지 다시 보내고, 그래도 안 되면 예외 처리함에 올라와요."
        how={["'실패' 숫자를 눌러 안 나간 알림 다시 보내기", "필요하면 회차·테이블·회원에게 공지 보내기", "아래 '문구 템플릿'에서 문구 고치고 미리보기 확인"]}
        actions={<Link href="/admin/audit?kind=template" className={btnLight}>문구 변경 이력·되돌리기</Link>}
      />
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="보냄" value={nSent ?? 0} tone="leaf" />
        <Stat label="예약됨" value={nPending ?? 0} />
        <Link href="/admin/messages?st=failed#log" className="block"><Stat label="실패" value={nFailed ?? 0} tone={nFailed ? "danger" : undefined} sub={nFailed ? "눌러서 다시 보내기" : undefined} /></Link>
      </div>

      <div className="mt-6">
        <NoticePanel sp={sp} ro={ro} />
      </div>

      <h2 id="log" className="mb-3 mt-8 scroll-mt-24 text-[17px] font-bold">발송 이력</h2>
      <form className="mb-3 flex flex-wrap items-end gap-2" action="/admin/messages#log">
        <label className="text-[13px] text-muted">받는 사람<input name="q" defaultValue={f.q ?? ""} placeholder="이름" className={`${ctl} mt-1 block w-36`} /></label>
        <label className="text-[13px] text-muted">
          종류
          <select name="tpl" defaultValue={f.tpl ?? ""} className={`${ctl} mt-1 block max-w-[220px]`}>
            <option value="">전체</option>
            {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-muted">
          상태
          <select name="st" defaultValue={f.st ?? ""} className={`${ctl} mt-1 block`}>
            <option value="">전체</option>
            {Object.entries(LOG_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-muted">부터<input type="date" name="from" defaultValue={f.from ?? ""} className={`${ctl} mt-1 block`} /></label>
        <label className="text-[13px] text-muted">까지<input type="date" name="to" defaultValue={f.to ?? ""} className={`${ctl} mt-1 block`} /></label>
        <button className={btnLight}>찾기</button>
        {filtered && <Link href="/admin/messages#log" className="inline-flex h-11 items-center px-2 text-[14px] text-muted hover:text-ink">조건 지우기</Link>}
      </form>
      <div className="shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead className="border-b border-line"><tr>{["예약·발송 시각", "받는 사람", "종류", "제목", "상태", "재시도", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((n) => {
              const failed = isFailedNotice(n);
              return (
                <tr key={n.id}>
                  <td className={`${td} text-muted`}>{fmtDateTime(n.sent_at ?? n.scheduled_at)}</td>
                  <td className={td}>{n.users?.name ?? "-"}</td>
                  <td className={td}>{kindLabel(n.template)}</td>
                  <td className={td}>{n.title}</td>
                  <td className={td}><Badge v={failed ? [n.status === "failed" ? "실패" : "푸시 실패", "danger"] : n.status === "sent" ? ["보냄", "leaf"] : ["예약", "muted"]} /></td>
                  <td className={`${td} text-muted`}>{n.attempts ? `${n.attempts}회${n.last_error ? `, ${n.last_error.slice(0, 30)}` : ""}` : "-"}</td>
                  <td className={td}>
                    {failed && !ro && (
                      <form action={resendNotice}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="back" value={here} />
                        <ConfirmButton confirm={`${n.users?.name ?? "받는 분"}님께 '${n.title}' 알림을 다시 보낼까요?`} className={`${btnLight} h-9 px-3 text-[13px]`}>다시 보내기</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-10 text-center text-muted">{filtered ? "조건에 맞는 알림이 없어요. 조건을 넓혀 다시 찾아 주세요." : "아직 보낸 알림이 없어요. 테이블이 확정되면 확정 안내부터 자동으로 나가요."}</p>
        )}
        {(total ?? 0) > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[14px] text-muted">
            <span>{total}건 중 {(f.page - 1) * LOG_PAGE_SIZE + 1}~{Math.min(f.page * LOG_PAGE_SIZE, total ?? 0)}</span>
            <span className="flex items-center gap-2">
              {f.page > 1 && <Link href={`/admin/messages${logSearch(f, f.page - 1)}#log`} className={`${btnLight} h-9 px-3`}>이전</Link>}
              <span className="tabular-nums">{f.page} / {pages}쪽</span>
              {f.page < pages && <Link href={`/admin/messages${logSearch(f, f.page + 1)}#log`} className={`${btnLight} h-9 px-3`}>다음</Link>}
            </span>
          </div>
        )}
      </div>

      <h2 className="mt-8 text-[17px] font-bold">문구 템플릿</h2>
      <p className="mb-3 mt-1 text-[13px] text-muted">칸을 비워 두면 기본 문구(흐린 글씨)로 나가요. 문구에 <code className="rounded bg-field px-1">{"{round}"}</code>처럼 중괄호로 감싼 말을 넣으면 보낼 때 실제 값(이 경우 회차 이름)으로 바뀌어요. 칸마다 넣을 수 있는 말이 아래에 있어요.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(TEMPLATES).map(([key, d]) => {
          const o = tpl[key] ?? {};
          const preview = render(key as keyof typeof TEMPLATES, SAMPLE_VARS, tpl);
          return (
            <Panel key={key} title={d.label} action={<span className="text-[12px] text-muted">{d.channel}</span>}>
              <p className="text-[13px] text-muted">보내는 때: {d.when}</p>
              <form action={saveTemplate} className="mt-3 space-y-2">
                <input type="hidden" name="key" value={key} />
                {d.title !== "" && <input name="title" readOnly={ro} defaultValue={o.title ?? ""} placeholder={d.title} className={`${ctl} w-full`} />}
                <textarea name="body" readOnly={ro} defaultValue={o.body ?? ""} placeholder={d.body} rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] outline-none focus:border-accent" />
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
          );
        })}
      </div>
    </div>
  );
}
