import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, Stat } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { ATTEND, label } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Attendance({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const { r } = await searchParams;
  const { rounds, round } = await roundsAndCurrent(r);
  const { data } = round
    ? await db().from("applications").select("id,attendance_status,table_id,users(name),dining_tables(id,slots(starts_at,region))").eq("round_id", round.id).eq("match_status", "CONFIRMED")
    : { data: [] };
  const rows = (data ?? []) as unknown as { id: string; attendance_status: string | null; table_id: string | null; users: { name: string }; dining_tables: { id: string; slots: { starts_at: string; region: string } } | null }[];
  const count = (s: string) => rows.filter((x) => x.attendance_status === s).length;
  const { data: noshow } = await db().from("exceptions").select("ref_id").eq("kind", "no_show").eq("status", "open");
  const candidates = new Set((noshow ?? []).map((n) => n.ref_id));
  const byTable = new Map<string, typeof rows>();
  for (const a of rows.filter((x) => x.dining_tables)) {
    const k = a.dining_tables!.id;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k)!.push(a);
  }
  const canceled = rows.filter((x) => x.attendance_status?.startsWith("CANCELED"));

  return (
    <div>
      <PageHeader title="참석·취소·노쇼" desc="체크인하지 않은 사람은 모임이 끝나면 노쇼 후보로 올라와요. 확정은 예외 처리함에서 해요." actions={<RoundPicker rounds={rounds} current={round?.id} />} />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="참석 예정" value={count("SCHEDULED")} />
        <Stat label="체크인" value={count("ATTENDED")} tone="leaf" />
        <Stat label="사전 취소" value={count("CANCELED_EARLY")} sub="2일 전까지, 환불" />
        <Stat label="늦은 취소" value={count("CANCELED_LATE")} sub="2일 안, 환불 없음" />
        <Stat label="노쇼" value={count("NO_SHOW")} tone={count("NO_SHOW") ? "danger" : undefined} sub={`확인 대기 후보 ${[...candidates].filter((c) => rows.some((x) => x.id === c)).length}`} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[...byTable.entries()].map(([tid, ms]) => {
          const s = ms[0].dining_tables!.slots;
          return (
            <Panel key={tid} title={`${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)} ${s.region}`} action={<Link href={`/admin/tables/${tid}`} className="text-[13px] text-muted hover:text-ink">테이블 보기</Link>}>
              <ul className="space-y-1.5 text-[14px]">
                {ms.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <Link href={`/admin/applicants/${m.id}`} className="hover:underline">{m.users.name}</Link>
                    <span className="flex items-center gap-1.5">
                      {candidates.has(m.id) && <Badge v={["노쇼 후보", "danger"]} />}
                      <Badge v={label(ATTEND, m.attendance_status)} />
                    </span>
                  </li>
                ))}
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
      {!rows.length && <p className="mt-6 rounded-2xl bg-card p-10 text-center text-muted">확정된 참가자가 없어요.</p>}
    </div>
  );
}
