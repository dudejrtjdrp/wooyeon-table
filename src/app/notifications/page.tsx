import Link from "next/link";
import { Screen } from "@/components/ui";
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
    <Screen title="알림" back="/">
      {!data?.length && <p className="mt-10 text-center text-[14px] text-muted">아직 받은 알림이 없어요.</p>}
      <ul className="mt-2 divide-y divide-line">
        {data?.map((n) => {
          const body = (
            <div className="py-4">
              <div className="flex items-center gap-2">
                {!n.read_at && <span className="size-2 rounded-full bg-accent" />}
                <p className="text-[15px] font-semibold">{n.title}</p>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{n.body}</p>
              <p className="mt-1 text-[12px] text-muted">{fmtDateTime(n.scheduled_at)}</p>
            </div>
          );
          return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
        })}
      </ul>
    </Screen>
  );
}
