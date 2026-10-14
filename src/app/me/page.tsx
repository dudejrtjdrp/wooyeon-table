import Link from "next/link";
import { Card, Pill, Screen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function Me() {
  const me = await requireMe();
  const { data } = await db()
    .from("applications")
    .select("id,application_status,payment_status,match_status,attendance_status,created_at,rounds(title)")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });
  const apps = (data ?? []) as unknown as {
    id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null; rounds: { title: string };
  }[];
  const { data: fb } = await db().from("feedbacks").select("application_id").eq("user_id", me.id);
  const done = new Set((fb ?? []).map((f) => f.application_id));

  return (
    <Screen title="내 정보" back="/">
      <Card className="mt-2">
        <p className="text-[18px] font-semibold">{me.name}</p>
        <p className="mt-1 text-[14px] text-muted">{me.phone}</p>
        <Link href="/onboarding?next=/me" className="mt-4 inline-block text-[14px] font-medium underline underline-offset-4">
          프로필 수정
        </Link>
      </Card>

      <h2 className="mt-8 text-[15px] font-semibold">참가 이력</h2>
      {!apps.length && <p className="mt-3 text-[14px] text-muted">아직 신청한 모임이 없어요.</p>}
      <ul className="mt-3 space-y-2">
        {apps.map((a) => {
          const h = headline(a);
          return (
            <li key={a.id}>
              <Link href={`/applications/${a.id}`} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3">
                <span className="text-[14px]">{a.rounds.title}</span>
                <span className="flex items-center gap-2">
                  {a.attendance_status === "ATTENDED" && (done.has(a.id) ? <Pill tone="leaf">후기 남김</Pill> : <Pill tone="accent">후기 전</Pill>)}
                  <Pill tone={h.tone}>{h.label}</Pill>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <form action={logout} className="mt-10 text-center">
        <button className="text-[14px] text-muted underline underline-offset-4">로그아웃</button>
      </form>
    </Screen>
  );
}
