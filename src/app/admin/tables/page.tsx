import Link from "next/link";
import { Badge, PageHeader, RoundPicker, Term, td, th } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TABLE_STATUS: Record<string, [string, "muted" | "accent" | "leaf" | "candle" | "danger" | "ink"]> = {
  CONFIRMED: ["확정", "accent"], VENUE_ASSIGNED: ["식당 배정", "accent"], READY: ["안내 완료", "accent"],
  IN_PROGRESS: ["모임 중", "candle"], DONE: ["모임 끝", "leaf"], DISSOLVED: ["해제", "muted"], DRAFT: ["작성 중", "muted"],
};

export default async function Tables({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const { r } = await searchParams;
  const { round, options } = await roundsAndCurrent(r);
  const { data } = round
    ? await db().from("dining_tables").select("id,status,score,reservation_name,slots(starts_at,region),venues(name),chat_rooms(id),applications(id,attendance_status,match_status)").eq("round_id", round.id).order("created_at")
    : { data: [] };
  const rows = (data ?? []) as unknown as {
    id: string; status: string; score: number; reservation_name: string | null; slots: { starts_at: string; region: string }; venues: { name: string } | null;
    chat_rooms: { id: string } | { id: string }[] | null; applications: { id: string; attendance_status: string | null; match_status: string }[];
  }[];
  rows.sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at) || a.slots.region.localeCompare(b.slots.region));

  return (
    <div>
      <PageHeader
        title="테이블·단체방"
        desc={<>확정된 테이블마다 참가자, 배정된 식당, <Term tip={TIP.단체방}>단체방</Term>, 안내 발송 상태를 봐요.</>}
        how={["오른쪽에서 회차 고르기", "일시를 눌러 테이블 상세 열기", <>상세에서 식당·예약·안내를 확인하고, 필요하면 <Term tip={TIP.긴급수정}>긴급 수정</Term></>]}
        actions={<RoundPicker rounds={options} current={round?.id} />}
      />
      <div className="mt-6 shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead className="border-b border-line"><tr>{["일시", "동네", "식당", "인원", "체크인", "매칭 점수", "단체방", "상태"].map((h) => <th key={h} className={th}>{h === "매칭 점수" ? <Term tip={TIP.매칭점수}>{h}</Term> : h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((t) => {
              const live = t.applications.filter((a) => a.match_status === "CONFIRMED");
              const att = live.filter((a) => a.attendance_status === "ATTENDED").length;
              return (
                <tr key={t.id} className="hover:bg-paper/60">
                  <td className={td}><Link href={`/admin/tables/${t.id}`} className="font-semibold text-accent hover:underline">{fmtDate(t.slots.starts_at)} {fmtTime(t.slots.starts_at)}</Link></td>
                  <td className={td}>{t.slots.region}</td>
                  <td className={td}>{t.venues?.name ?? <span className="text-danger">미배정</span>}</td>
                  <td className={td}>{live.length}명</td>
                  <td className={`${td} tabular-nums`}>{att ? `${att}명` : <span className="text-muted">-</span>}</td>
                  <td className={`${td} tabular-nums`}>{Math.round(Number(t.score))}점</td>
                  <td className={td}>{t.chat_rooms ? "생성됨" : <span className="text-danger">없음</span>}</td>
                  <td className={td}><Badge v={TABLE_STATUS[t.status] ?? ["기타", "muted"]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-muted">이 회차에는 아직 테이블이 없어요. 매칭 마감 뒤에 생겨요.</p>}
      </div>
    </div>
  );
}
