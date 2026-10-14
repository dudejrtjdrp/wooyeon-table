import Link from "next/link";
import { Card, Pill, Screen } from "@/components/ui";
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

  return (
    <Screen title="모집 중인 일정" back="/">
      {!rounds?.length && <p className="mt-10 text-center text-muted">지금은 모집 중인 일정이 없어요.</p>}
      <div className="mt-2 space-y-4">
        {rounds?.map((r) => {
          const slots = [...(r.slots ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const dates = [...new Set(slots.map((s) => dateKey(s.starts_at)))];
          const regions = [...new Set(slots.map((s) => s.region))];
          const appId = applied.get(r.id);
          return (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[18px] font-semibold">{r.title}</h2>
                {appId ? <Pill tone="leaf">신청함</Pill> : <Pill tone="accent">모집 중</Pill>}
              </div>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex gap-3"><dt className="w-14 shrink-0 text-muted">날짜</dt><dd>{dates.map((d) => fmtDate(`${d}T12:00:00+09:00`)).join(", ")}</dd></div>
                <div className="flex gap-3"><dt className="w-14 shrink-0 text-muted">시간</dt><dd>{slots[0] ? fmtTime(slots[0].starts_at) : "-"} 시작</dd></div>
                <div className="flex gap-3"><dt className="w-14 shrink-0 text-muted">동네</dt><dd>{regions.join(" · ")}</dd></div>
                <div className="flex gap-3"><dt className="w-14 shrink-0 text-muted">마감</dt><dd>{fmtDateTime(r.apply_deadline)}</dd></div>
              </dl>
              <Link
                href={appId ? `/applications/${appId}` : `/apply/${r.id}`}
                className="mt-4 block rounded-xl bg-ink py-3 text-center text-[15px] font-semibold text-white"
              >
                {appId ? "내 신청 보기" : "이 일정으로 신청하기"}
              </Link>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
