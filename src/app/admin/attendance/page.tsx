import { isClaimed } from "@/lib/attendance-rules";
import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, Stat } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { ATTEND, label } from "@/lib/labels";
import { db } from "@/lib/supabase";
import { now } from "@/lib/clock";
import { attendanceOps, type AttendOp } from "@/lib/admin-manual-rules";
import { ctl } from "@/components/admin-ui";
import { ConfirmButton } from "../confirm-button";
import { attendanceAction } from "./actions";

const OP_BTN: Record<AttendOp, { text: string; cls: string; confirm?: (name: string) => string }> = {
  checkin: { text: "체크인", cls: "bg-leaf text-white" },
  noshow: { text: "노쇼 확정", cls: "bg-danger text-white", confirm: (n) => `${n}님을 노쇼로 확정해요. 최근 90일 노쇼 횟수에 따라 경고, 30일 신청 제한, 영구 제한 검토가 바로 걸리고 본인에게 알림이 가요. 계속할까요?` },
  revert: { text: "참석 예정으로 되돌리기", cls: "border border-line bg-card text-ink", confirm: (n) => `${n}님을 참석 예정으로 되돌려요. 노쇼였다면 이미 걸린 경고·제한은 그대로라 신청자 상세에서 따로 풀어야 해요. 계속할까요?` },
};

export const dynamic = "force-dynamic";

export default async function Attendance({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await requireAdmin();
  const { r } = await searchParams;
  const { rounds, round } = await roundsAndCurrent(r);
  const { data } = round
    ? await db().from("applications").select("id,attendance_status,table_id,users(name),dining_tables(id,status,slots(starts_at,region))").eq("round_id", round.id).eq("match_status", "CONFIRMED")
    : { data: [] };
  const rows = (data ?? []) as unknown as { id: string; attendance_status: string | null; table_id: string | null; users: { name: string }; dining_tables: { id: string; status: string; slots: { starts_at: string; region: string } } | null }[];
  const clock = await now();
  const attendedIds = rows.filter((x) => x.attendance_status === "ATTENDED").map((x) => x.id);
  const { data: fbs } = attendedIds.length ? await db().from("feedbacks").select("application_id").in("application_id", attendedIds) : { data: [] };
  const gaveFeedback = new Set((fbs ?? []).map((f) => f.application_id));
  const canWrite = me.level === "full";
  const count = (s: string) => rows.filter((x) => x.attendance_status === s).length;
  const { data: noshow } = await db().from("exceptions").select("ref_id,reason").eq("kind", "no_show").eq("status", "open");
  const candidates = new Set((noshow ?? []).map((n) => n.ref_id));
  // 본인이 '참석했는데 체크인을 못 했어요'라고 알린 후보
  const claimed = new Set((noshow ?? []).filter((n) => isClaimed(n.reason)).map((n) => n.ref_id));
  const byTable = new Map<string, typeof rows>();
  for (const a of rows.filter((x) => x.dining_tables)) {
    const k = a.dining_tables!.id;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k)!.push(a);
  }
  const canceled = rows.filter((x) => x.attendance_status?.startsWith("CANCELED"));

  return (
    <div>
      <PageHeader title="참석·취소·노쇼" desc="체크인하지 않은 사람은 모임이 끝나면 노쇼 후보로 올라와요. 현장에서 확인한 체크인·노쇼는 이름 옆 '처리'에서 바로 정해요." actions={<RoundPicker rounds={rounds} current={round?.id} />} />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="참석 예정" value={count("SCHEDULED")} />
        <Stat label="체크인" value={count("ATTENDED")} tone="leaf" />
        <Stat label="사전 취소" value={count("CANCELED_EARLY")} sub="환불 마감 전, 환불" />
        <Stat label="늦은 취소" value={count("CANCELED_LATE")} sub="환불 마감 뒤, 환불 없음" />
        <Stat label="노쇼" value={count("NO_SHOW")} tone={count("NO_SHOW") ? "danger" : undefined} sub={`확인 대기 후보 ${[...candidates].filter((c) => rows.some((x) => x.id === c)).length}`} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[...byTable.entries()].map(([tid, ms]) => {
          const s = ms[0].dining_tables!.slots;
          return (
            <Panel key={tid} title={`${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)} ${s.region}`} action={<Link href={`/admin/tables/${tid}`} className="text-[13px] text-muted hover:text-ink">테이블 보기</Link>}>
              <ul className="space-y-2 text-[14px]">
                {ms.map((m) => {
                  const ops = canWrite ? attendanceOps({ status: m.attendance_status, tableStatus: m.dining_tables!.status, startsAt: s.starts_at, now: clock, hasFeedback: gaveFeedback.has(m.id) }) : [];
                  return (
                    <li key={m.id} id={`a-${m.id}`} className="scroll-mt-6">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/admin/applicants/${m.id}`} className="hover:underline">{m.users.name}</Link>
                        <span className="flex items-center gap-1.5">
                          {candidates.has(m.id) && <Badge v={["노쇼 후보", "danger"]} />}
                          {claimed.has(m.id) && <Badge v={["본인 참석 알림", "accent"]} />}
                          <Badge v={label(ATTEND, m.attendance_status)} />
                        </span>
                      </div>
                      {ops.length > 0 && (
                        <details className="group mt-1 rounded-xl border border-line open:bg-paper/60">
                          <summary className="cursor-pointer list-none px-3 py-1.5 text-[12px] font-semibold text-accent">처리 <span className="font-normal text-muted group-open:hidden">· {ops.map((o) => OP_BTN[o].text).join(" · ")}</span></summary>
                          <form action={attendanceAction} className="flex flex-wrap items-center gap-2 px-3 pb-3">
                            <input type="hidden" name="app_id" value={m.id} />
                            {round && <input type="hidden" name="r" value={round.id} />}
                            <input name="note" maxLength={100} placeholder="메모 (선택) 예: 현장에서 확인" className={`${ctl} h-10 min-w-0 flex-1 text-[13px]`} />
                            {ops.map((o) =>
                              OP_BTN[o].confirm ? (
                                <ConfirmButton key={o} name="op" value={o} confirm={OP_BTN[o].confirm!(m.users.name)} className={`h-10 rounded-xl px-3 text-[13px] font-semibold ${OP_BTN[o].cls}`}>{OP_BTN[o].text}</ConfirmButton>
                              ) : (
                                <button key={o} name="op" value={o} className={`h-10 rounded-xl px-3 text-[13px] font-semibold ${OP_BTN[o].cls}`}>{OP_BTN[o].text}</button>
                              ),
                            )}
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </div>
      {!!canceled.length && (
        <Panel title="취소한 사람" className="mt-4">
          <ul className="space-y-1.5 text-[14px]">
            {canceled.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <Link href={`/admin/applicants/${m.id}`} className="hover:underline">{m.users.name}</Link>
                <Badge v={label(ATTEND, m.attendance_status)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {!rows.length && <p className="mt-6 shadow-card rounded-[20px] bg-card p-10 text-center text-muted">확정된 참가자가 없어요.</p>}
    </div>
  );
}
