import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { EmptyState, IMG, Photo, Pill, TabScreen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, dday, ddayLabel, fmtClock, fmtDay, fmtSlot, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 일정마다 다른 사진: 식당, 창가, 함께 나누는 음식, 동네 저녁
const PHOTOS = [IMG.scheduleRestaurant, IMG.restaurantWindow, IMG.sharedDishes, IMG.neighborhood];

/** B2 일정 */
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

  return (
    <TabScreen title="일정" sub="여러 개 고를수록 테이블이 잘 꾸려져요.">
      {!rounds?.length && <EmptyState icon={<CalendarDays size={40} className="text-accent/40" />} title="지금은 모집 중인 일정이 없어요" body="새 일정이 열리면 알림으로 알려드릴게요." />}
      <div className="mt-6 space-y-4">
        {rounds?.map((r, i) => {
          const slots = [...(r.slots ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const times = [...new Map(slots.map((s) => [`${dateKey(s.starts_at)}${fmtTime(s.starts_at)}`, s.starts_at])).values()];
          const regions = [...new Set(slots.map((s) => s.region))];
          const appId = applied.get(r.id);
          const first = i === 0 && !appId;
          return (
            <article key={r.id} className="shadow-card animate-rise overflow-hidden rounded-[24px] bg-card" style={{ animationDelay: `${i * 0.05}s` }}>
              <Photo src={PHOTOS[i % PHOTOS.length]} className={i === 0 ? "h-[150px]" : "h-[96px]"} position="center 60%" priority={i === 0} />
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[22px] font-bold tracking-[-0.03em] text-ink">{r.title}</h2>
                  {appId ? <Pill tone="leaf">신청함</Pill> : <Pill tone="accent">{ddayLabel(dday(times[0] ?? r.apply_deadline, t))}</Pill>}
                </div>
                <div className={`mt-4 grid gap-2 ${times.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {times.map((iso) => (
                    <Link key={iso} href={appId ? `/applications/${appId}` : `/apply/${r.id}`} className="flex items-center gap-2.5 rounded-2xl bg-field px-3 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CalendarDays size={17} /></span>
                      <span className="min-w-0 flex-1 whitespace-nowrap">
                        <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">{fmtDay(iso)}</span>
                        <span className="block text-[13px] text-muted">{fmtClock(iso).replace("저녁", "오후")}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted" />
                    </Link>
                  ))}
                </div>
                <p className="mt-4 text-[14px] font-semibold text-ink">동네</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {regions.map((g) => (
                    <span key={g} className="rounded-full bg-accent-soft px-4 py-2 text-[15px] font-semibold text-accent">{g}</span>
                  ))}
                </div>
                <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[14px] text-muted">
                  <CalendarDays size={17} className="shrink-0" />
                  {fmtSlot(r.apply_deadline)}에 마감하고 바로 테이블을 꾸려요.
                </p>
                <Link
                  href={appId ? `/applications/${appId}` : `/apply/${r.id}`}
                  className={`mt-4 flex h-[56px] items-center justify-center gap-1 rounded-2xl text-[17px] font-semibold active:scale-[.985] ${first ? "shadow-cta bg-accent text-white" : "border-[1.5px] border-accent bg-card text-accent"}`}
                >
                  {appId ? "내 신청 보기" : "이 일정으로 신청하기"} <ChevronRight size={20} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </TabScreen>
  );
}
