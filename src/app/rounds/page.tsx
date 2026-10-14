import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState, Pill, TabScreen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Rounds() {
  const me = await requireProfile();
  const t = await now();
  const { data: rounds } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,match_at,status,slots(id,region,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline");
  const { data: mine } = await db().from("applications").select("round_id,id").eq("user_id", me.id).neq("application_status", "CANCELED");
  const applied = new Map((mine ?? []).map((a) => [a.round_id, a.id]));

  const dday = (iso: string) => {
    const d = Math.ceil((new Date(iso).getTime() - t.getTime()) / 86_400_000);
    return d <= 0 ? "오늘 마감" : `마감 D-${d}`;
  };

  return (
    <TabScreen title="일정">
      <p className="text-[14px] text-muted">갈 수 있는 날짜와 동네를 여러 개 고를수록 테이블이 잘 꾸려져요.</p>
      {!rounds?.length && <EmptyState icon={<CalendarDays size={40} className="text-line" />} title="지금은 모집 중인 일정이 없어요" body="새 일정이 열리면 알림으로 알려드릴게요." />}
      <div className="mt-4 space-y-3">
        {rounds?.map((r) => {
          const slots = [...(r.slots ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const times = [...new Map(slots.map((s) => [dateKey(s.starts_at), s.starts_at])).values()];
          const regions = [...new Set(slots.map((s) => s.region))];
          const appId = applied.get(r.id);
          return (
            <article key={r.id} className="rounded-3xl bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[19px] font-bold tracking-[-0.02em]">{r.title}</h2>
                {appId ? <Pill tone="leaf">신청함</Pill> : <Pill tone="candle">{dday(r.apply_deadline)}</Pill>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {times.map((iso) => (
                  <div key={iso} className="rounded-2xl bg-paper px-4 py-3">
                    <p className="text-[15px] font-semibold">{fmtDate(iso)}</p>
                    <p className="text-[13px] text-muted">{fmtTime(iso)} 시작</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {regions.map((g) => (
                  <span key={g} className="rounded-full border border-line px-3 py-1 text-[13px]">{g}</span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-muted">{fmtDateTime(r.apply_deadline)}에 마감하고 바로 테이블을 꾸려요</p>
              <Link
                href={appId ? `/applications/${appId}` : `/apply/${r.id}`}
                className={`mt-4 flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold ${appId ? "border border-line text-ink" : "bg-accent text-white"}`}
              >
                {appId ? "내 신청 보기" : "이 일정으로 신청하기"}
              </Link>
            </article>
          );
        })}
      </div>
    </TabScreen>
  );
}
