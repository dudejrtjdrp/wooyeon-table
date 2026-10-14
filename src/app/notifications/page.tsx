import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState, TabScreen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const me = await requireMe();
  const nowIso = (await now()).toISOString();
  const { data } = await db()
    .from("notifications")
    .select("id,title,body,link,scheduled_at,read_at")
    .eq("user_id", me.id)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: false })
    .limit(50);
  // 열어 본 알림은 읽음 처리
  await db().from("notifications").update({ read_at: nowIso }).eq("user_id", me.id).is("read_at", null).lte("scheduled_at", nowIso);

  return (
    <TabScreen title="알림">
      {!data?.length && <EmptyState icon={<Bell size={40} className="text-line" />} title="아직 받은 알림이 없어요" body="매칭 결과와 모임 안내가 여기로 와요." />}
      {!!data?.length && <ul className="mt-2 overflow-hidden rounded-3xl bg-card">
        {data?.map((n) => {
          const body = (
            <div className={`flex gap-3 px-5 py-4 ${n.read_at ? "" : "bg-accent-soft/50"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{n.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{n.body}</p>
                <p className="mt-1.5 text-[12px] text-muted">{fmtDateTime(n.scheduled_at)}</p>
              </div>
            </div>
          );
          return <li key={n.id} className="border-b border-line last:border-0">{n.link ? <Link href={n.link} className="block active:bg-paper">{body}</Link> : body}</li>;
        })}
      </ul>}
    </TabScreen>
  );
}
