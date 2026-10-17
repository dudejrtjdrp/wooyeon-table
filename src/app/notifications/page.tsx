import Link from "next/link";
import { Bell, CalendarCheck, CalendarDays, ChevronRight, CircleX, CreditCard, FileText, MessageCircle, RotateCcw, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, fmtDay } from "@/lib/format";
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
  const { data } = await db()
    .from("notifications")
    .select("id,template,title,body,link,scheduled_at,read_at")
    .eq("user_id", me.id)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: false })
    .limit(50);
  // 열어 본 알림은 읽음 처리 (화면에는 이번에 처음 본 것을 표시해 둔다)
  await db().from("notifications").update({ read_at: nowIso }).eq("user_id", me.id).is("read_at", null).lte("scheduled_at", nowIso);

  return (
    <TabScreen title="알림">
      {!data?.length && <EmptyState icon={<Bell size={40} className="text-faint" />} title="아직 받은 알림이 없어요" body="매칭 결과와 모임 안내가 여기로 와요." />}
      <ul className="mt-6 space-y-2.5">
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
                <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted">{n.body}</p>
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
