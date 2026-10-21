import Link from "next/link";
import { Bell, CalendarCheck, CalendarDays, ChevronRight, CircleX, CreditCard, FileText, MessageCircle, RotateCcw, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, fmtDateTime, fmtDay } from "@/lib/format";
import { scheduledTarget } from "@/lib/scheduled-rules";
import { db } from "@/lib/supabase";
import { after } from "next/server";
import { maybeTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// 알림 종류별 아이콘
const ICON: Record<string, LucideIcon> = {
  confirmed: CalendarCheck, reminder: CalendarDays, reminder_chat: CalendarDays, paid: CreditCard, payment_pending: CreditCard,
  applied: FileText, feedback: MessageCircle, feedback_remind: MessageCircle, refunded: RotateCcw, refund_failed: RotateCcw,
  canceled: CircleX, attendance_canceled: CircleX, alternative: Sparkles, reallocated: Users, seat_offer: Sparkles, chat: MessageCircle, next_round: Sparkles,
};

function ago(iso: string, at: Date) {
  const d = at.getTime() - new Date(iso).getTime();
  if (d < 60_000) return "방금";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 6 * 3600_000) return `${Math.floor(d / 3600_000)}시간 전`;
  if (dateKey(iso) === dateKey(at.toISOString())) return "오늘";
  return fmtDay(iso).replace(/\(.\)$/, "");
}

/** C4 알림 */
export default async function Notifications() {
  const me = await requireMe();
  // 예약 실행(GitHub Actions)이 몇 시간씩 밀릴 때가 있어, 모임 화면을 열 때도 밀린 일(시작 콘텐츠·체크인 안내·리마인드)을 돌린다
  after(() => maybeTick().catch(() => null));
  const t = await now();
  const nowIso = t.toISOString();
  // 받은 알림은 실제로 나간 것만. 아직 안 나간 예약(하루 전 안내 등)은 '예정된 안내'로 따로 보여 준다
  const [{ data }, { data: upcoming }] = await Promise.all([
    db()
      .from("notifications")
      .select("id,template,title,body,link,scheduled_at,read_at")
      .eq("user_id", me.id)
      .eq("status", "sent")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: false })
      .limit(50),
    db().from("notifications").select("id,template,title,link,dedupe_key,scheduled_at").eq("user_id", me.id).eq("status", "pending").order("scheduled_at").limit(5),
  ]);
  // 열어 본 알림은 읽음 처리 (화면에는 이번에 처음 본 것을 표시해 둔다)
  await db().from("notifications").update({ read_at: nowIso }).eq("user_id", me.id).eq("status", "sent").is("read_at", null).lte("scheduled_at", nowIso);

  return (
    <TabScreen title="알림">
      {!!upcoming?.length && (
        <section className="mt-6" aria-labelledby="upcoming">
          <h2 id="upcoming" className="px-1 text-[14px] font-bold text-muted">예정된 안내</h2>
          <ul className="mt-2.5 space-y-2">
            {upcoming.map((n) => {
              const go = scheduledTarget(n);
              const Icon = ICON[n.template] ?? Bell;
              const when = Date.parse(n.scheduled_at) <= t.getTime() ? "곧 보내요" : `${fmtDateTime(n.scheduled_at)}에 보내요`;
              const inner = (
                <div className="flex items-center gap-3.5 rounded-[20px] border border-dashed border-line bg-card/60 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-faint"><Icon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{when}{go ? ` · ${go.cta}` : ""}</p>
                  </div>
                  {go && <ChevronRight size={20} className="shrink-0 text-muted" />}
                </div>
              );
              return <li key={n.id}>{go ? <Link href={go.href} className="block active:scale-[.99]">{inner}</Link> : inner}</li>;
            })}
          </ul>
          <p className="mt-2 px-1 text-[13px] leading-relaxed text-muted">일정을 바꾸거나 취소하면 예정된 안내도 함께 바뀌어요.</p>
        </section>
      )}
      {!!upcoming?.length && !!data?.length && <h2 className="mt-7 px-1 text-[14px] font-bold text-muted">받은 알림</h2>}
      {!data?.length && <EmptyState icon={<Bell size={40} className="text-faint" />} title="아직 받은 알림이 없어요" body="매칭 결과와 모임 안내가 여기로 와요." />}
      <ul className={`${upcoming?.length ? "mt-2.5" : "mt-6"} space-y-2.5`}>
        {data?.map((n, i) => {
          const Icon = ICON[n.template] ?? Bell;
          const unread = !n.read_at;
          const body = (
            <div className="relative flex items-center gap-4 rounded-[20px] bg-card p-4">
              <span className={`relative flex size-11 shrink-0 items-center justify-center rounded-full ${unread ? "bg-accent text-white" : "bg-accent-soft text-accent"}`}>
                <Icon size={20} />
                {unread && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-card bg-[#F4C542]" aria-label="새 알림" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-[16px] text-ink ${unread ? "font-extrabold" : "font-bold"}`}>{n.title}</p>
                  <span className="shrink-0 pt-0.5 text-[12px] text-muted">{ago(n.scheduled_at, t)}</span>
                </div>
                <p className={`mt-1 text-[14px] leading-relaxed text-muted ${n.template === "announcement" ? "" : "line-clamp-2"}`}>{n.body}</p>
              </div>
              {n.link && <ChevronRight size={20} className="shrink-0 text-muted" />}
            </div>
          );
          return (
            <li key={n.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}>
              {n.link ? <Link href={n.link} className="block active:scale-[.99]">{body}</Link> : body}
            </li>
          );
        })}
      </ul>
    </TabScreen>
  );
}
