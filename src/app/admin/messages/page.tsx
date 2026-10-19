import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Stat, btnLight, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { NOTICE } from "@/lib/labels";
import { messagesLegacyTarget } from "@/lib/legacy-links";
import { MESSAGE_GROUPS, groupOf } from "@/lib/message-groups";
import { escapeLike } from "@/lib/members";
import { LOG_PAGE_SIZE, LOG_STATUS, isFailedNotice, logRange, logSearch, pageCount, parseLogFilter } from "@/lib/notice-rules";
import { db } from "@/lib/supabase";
import { TEMPLATES } from "@/lib/templates";
import { ConfirmButton } from "../confirm-button";
import { resendNotice } from "./actions";
import { MessagesHeader } from "./header";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const kindLabel = (k: string) => (TEMPLATES as Record<string, { label: string }>)[k]?.label ?? NOTICE[k] ?? "기타 알림";
const KINDS = [...new Set([...Object.keys(TEMPLATES), ...Object.keys(NOTICE)])];

/** 자동 메시지 › 발송 이력. 공지 보내기·문구 템플릿은 옆 탭 */
export default async function Messages({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin();
  const ro = me.level !== "full";
  const sp = await searchParams;
  // 예전 주소(공지 대상 값, ?tab=templates)로 오면 나뉜 탭으로
  const legacy = messagesLegacyTarget(sp);
  if (legacy) redirect(legacy);
  const f = parseLogFilter(sp, new Set(KINDS));

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
      <MessagesHeader
        current="/admin/messages"
        failed={nFailed ?? 0}
        desc="자동 안내가 언제 누구에게 나갔는지 봐요. 실패하면 세 번까지 다시 보내고, 그래도 안 되면 예외 처리함에 올라와요."
        how={["'실패' 숫자를 눌러 안 나간 알림만 보기", "'다시 보내기'로 한 건씩 다시 보내기", "문구는 '문구 템플릿' 탭에서 고치기"]}
      />
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="보냄" value={nSent ?? 0} tone="leaf" />
        <Stat label="예약됨" value={nPending ?? 0} />
        <Link href="/admin/messages?st=failed#log" className="block"><Stat label="실패" value={nFailed ?? 0} tone={nFailed ? "danger" : undefined} sub={nFailed ? "눌러서 다시 보내기" : undefined} /></Link>
      </div>

      <h2 id="log" className="sr-only">발송 이력</h2>
      <form className="mb-3 mt-6 flex flex-wrap items-end gap-2" action="/admin/messages#log">
        <label className="text-[13px] text-muted">받는 사람<input name="q" defaultValue={f.q ?? ""} placeholder="이름" className={`${ctl} mt-1 block w-36`} /></label>
        <label className="text-[13px] text-muted">
          종류
          <select name="tpl" defaultValue={f.tpl ?? ""} className={`${ctl} mt-1 block max-w-[220px]`}>
            <option value="">전체</option>
            {MESSAGE_GROUPS.map((g) => {
              const ks = KINDS.filter((k) => groupOf(k) === g.key);
              return ks.length ? <optgroup key={g.key} label={g.label}>{ks.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</optgroup> : null;
            })}
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

    </div>
  );
}
