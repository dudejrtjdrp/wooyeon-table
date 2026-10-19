import { isBot } from "@/lib/sim/persona-id";
import Link from "next/link";
import { Badge, Panel, btnLight } from "@/components/admin-ui";
import { Required } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtSlot } from "@/lib/format";
import { type PrefItem, type PrefRow, prefListIds, prefLists } from "@/lib/pref-list";
import { type Block, type Pref, type Relation, personRelations, relationIds, reportStatusText } from "@/lib/safety-rules";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../confirm-button";
import { reopenReport } from "./actions";

type Report = { id: string; reporter_id: string; reported_id: string; reason: string; detail: string | null; status: string; action: string | null; admin_note: string | null; created_at: string; reviewed_at: string | null };

/** 닫은 신고 다시 열기 폼 (사유 필수, 한 번 더 확인) */
export function ReopenForm({ id, back, canWrite }: { id: string; back: string; canWrite: boolean }) {
  if (!canWrite) return null;
  return (
    <details className="mt-1.5">
      <summary className="inline-flex min-h-9 cursor-pointer items-center text-[13px] font-semibold text-accent">다시 열어 검토하기</summary>
      <form action={reopenReport} className="mt-2 space-y-2">
        <input type="hidden" name="report_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <label className="block text-[13px] text-muted">
          다시 여는 사유<Required />
          <textarea name="note" rows={2} required minLength={4} placeholder="예: 같은 사람에 대한 신고가 또 들어와 다시 봐요" className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 text-[14px] text-ink outline-none focus:border-accent" />
        </label>
        <ConfirmButton confirm="이 신고를 '검토 전'으로 되돌리고 예외 처리함에 다시 올려요. 이미 건 계정 조치는 그대로 남아요. 계속할까요?" className={btnLight}>다시 열기</ConfirmButton>
      </form>
    </details>
  );
}

function People({ title, rows, names, empty }: { title: string; rows: Relation[]; names: Map<string, string>; empty: string }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink">{title} <span className="font-normal text-muted">{rows.length}명</span></p>
      {!rows.length ? <p className="mt-1 text-[13px] text-muted">{empty}</p> : (
        <ul className="mt-1 space-y-1 text-[14px]">
          {rows.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center gap-x-2">
              <Link href={`/admin/members/${r.userId}`} className="inline-flex min-h-9 items-center font-semibold text-ink hover:text-accent">{names.get(r.userId) ?? "알 수 없음"}</Link>
              <span className="text-[12px] text-muted">{r.times > 1 ? `${r.times}번 · ` : ""}{fmtDate(r.last)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TableInfo = { id: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null };

/** 고른/받은 '또 만나고 싶어요'·'다시는 싫어요' 목록: 누구 · 어느 모임 · 언제 */
function PrefTable({ title, rows, names, tables, empty }: { title: string; rows: PrefItem[]; names: Map<string, string>; tables: Map<string, TableInfo>; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-ink">{title} <span className="font-normal text-muted">{rows.length}건</span></p>
      {!rows.length ? <p className="mt-1 text-[13px] text-muted">{empty}</p> : (
        <ul className="mt-1.5 divide-y divide-line rounded-xl bg-paper px-3 text-[14px]">
          {rows.map((x) => {
            const t = tables.get(x.tableId);
            return (
              <li key={`${x.userId}|${x.tableId}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2">
                <Badge v={x.pref === "avoid" ? ["다시는 싫어요", "danger"] : ["또 만나고 싶어요", "leaf"]} />
                <Link href={`/admin/members/${x.userId}`} className="inline-flex min-h-9 items-center font-semibold text-ink hover:text-accent">{names.get(x.userId) ?? "알 수 없음"}</Link>
                <Link href={`/admin/tables/${x.tableId}`} className="min-w-0 text-[13px] text-ink2 underline-offset-4 hover:text-accent hover:underline">
                  {t?.slots ? `${fmtSlot(t.slots.starts_at)} ${t.slots.region}` : "테이블"}{t?.venues ? ` · ${t.venues.name}` : ""}
                </Link>
                <span className="ml-auto text-[12px] tabular-nums text-muted">{fmtDate(x.at)} 고름</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 한 사람의 비선호·차단·신고 (PRD 11장 '개인별 비선호·차단·신고 검토').
 * 회원 상세와 피드백·안전(사람별 보기)이 함께 쓴다. 선호·차단은 상대 참가자에게는 안 보이고(FDB-04) 운영자 화면에서만 보인다
 */
export async function PersonSafety({ userId, back, canWrite }: { userId: string; back: string; canWrite: boolean }) {
  // or() 조건에 그대로 들어가니 id 모양만 받는다
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  const [{ data: prefs }, { data: blocks }, { data: reps }] = await Promise.all([
    db().from("person_prefs").select("from_user,to_user,pref,table_id,created_at").or(`from_user.eq.${userId},to_user.eq.${userId}`).limit(500),
    db().from("blocks").select("blocker_id,blocked_id,created_at").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`).limit(500),
    db().from("safety_reports").select("id,reporter_id,reported_id,reason,detail,status,action,admin_note,created_at,reviewed_at").or(`reporter_id.eq.${userId},reported_id.eq.${userId}`).order("created_at", { ascending: false }).limit(100),
  ]);
  const rel = personRelations(userId, (prefs ?? []) as Pref[], (blocks ?? []) as Block[]);
  const pl = prefLists(userId, (prefs ?? []) as PrefRow[]);
  const pIds = prefListIds(pl);
  const reports = (reps ?? []) as Report[];
  const ids = [...new Set([...relationIds(rel), ...pIds.users, ...reports.flatMap((r) => [r.reporter_id, r.reported_id])])].filter((x) => x !== userId);
  const [{ data: users }, { data: tbs }] = await Promise.all([
    ids.length ? db().from("users").select("id,name,login_id,is_demo").in("id", ids) : Promise.resolve({ data: [] }),
    pIds.tables.length ? db().from("dining_tables").select("id,slots(starts_at,region),venues(name)").in("id", pIds.tables) : Promise.resolve({ data: [] }),
  ]);
  // 시연 봇이 남긴 선호는 진짜 회원 것으로 보이지 않게 이름 옆에 표시한다
  const names = new Map((users ?? []).map((u) => [u.id, isBot(u) ? `${u.name} (시연 봇)` : u.name]));
  const tables = new Map(((tbs ?? []) as unknown as TableInfo[]).map((t) => [t.id, t]));
  const got = reports.filter((r) => r.reported_id === userId);
  const gave = reports.filter((r) => r.reporter_id === userId);

  const ReportRow = ({ r, other }: { r: Report; other: string }) => (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums text-[13px] text-muted">{fmtDate(r.created_at)}</span>
        <Link href={`/admin/members/${other}`} className="font-semibold text-ink hover:text-accent">{names.get(other) ?? "알 수 없음"}</Link>
        <span className="min-w-0 flex-1 text-ink">{r.reason}</span>
        <Badge v={r.status === "open" ? ["검토 전", "danger"] : [reportStatusText(r), "muted"]} />
      </div>
      {r.detail && <p className="mt-0.5 text-[13px] text-muted">&ldquo;{r.detail}&rdquo;</p>}
      {r.status === "open" ? (
        <Link href="/admin/exceptions?k=safety" className="mt-1 inline-flex min-h-9 items-center text-[13px] font-semibold text-accent hover:underline">예외 처리함에서 조치하기</Link>
      ) : (
        <>
          {(r.reviewed_at || r.admin_note) && <p className="mt-0.5 text-[12px] text-muted">{r.reviewed_at ? `${fmtDateTime(r.reviewed_at)} 검토` : ""}{r.admin_note ? ` · ${r.admin_note}` : ""}</p>}
          <ReopenForm id={r.id} back={back} canWrite={canWrite} />
        </>
      )}
    </li>
  );

  return (
    <div id="safety" className="space-y-4">
      <Panel title="또 만나고 싶어요·다시는 싫어요" action={<Badge v={["참가자끼리는 안 보여요", "muted"]} />}>
        <div className="grid gap-5 lg:grid-cols-2">
          <PrefTable title="이 회원이 고른 사람" rows={pl.gave} names={names} tables={tables} empty="모임 뒤에 고른 사람이 없어요." />
          <PrefTable title="이 회원을 고른 사람" rows={pl.got} names={names} tables={tables} empty="이 회원을 고른 사람이 없어요." />
        </div>
        <p className="mt-4 rounded-xl bg-accent-soft/50 px-3 py-2 text-[13px] text-ink2">참가자가 모임 뒤에 직접 고른 것이라 운영자가 바꿀 수 없어요. 고른 그대로 다음 매칭에 들어가요.</p>
      </Panel>
      <Panel title="차단" action={<Badge v={["참가자끼리는 안 보여요", "muted"]} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <People title="이 회원이 차단" rows={rel.gaveBlock} names={names} empty="차단한 사람이 없어요." />
          <People title="이 회원을 차단" rows={rel.gotBlock} names={names} empty="차단한 사람이 없어요." />
        </div>
        <p className="mt-4 text-[13px] text-muted">&lsquo;다시는 싫어요&rsquo;·차단·신고 관계인 사람과는 다음 매칭에서 같은 테이블에 앉지 않아요.</p>
      </Panel>
      <Panel title="신고">
        <p className="text-[13px] font-semibold text-ink">받은 신고 <span className="font-normal text-muted">{got.length}건</span></p>
        {!got.length ? <p className="mt-1 text-[13px] text-muted">받은 신고가 없어요.</p> : <ul className="divide-y divide-line text-[14px]">{got.map((r) => <ReportRow key={r.id} r={r} other={r.reporter_id} />)}</ul>}
        <p className="mt-4 text-[13px] font-semibold text-ink">낸 신고 <span className="font-normal text-muted">{gave.length}건</span></p>
        {!gave.length ? <p className="mt-1 text-[13px] text-muted">낸 신고가 없어요.</p> : <ul className="divide-y divide-line text-[14px]">{gave.map((r) => <ReportRow key={r.id} r={r} other={r.reported_id} />)}</ul>}
      </Panel>
    </div>
  );
}
