import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { ErrorText } from "@/components/ui";
import { BackButton } from "@/components/client";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDay, fmtSlot } from "@/lib/format";
import { sidoOf } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { keepPass, refund, transfer } from "./actions";
import { ResolveChoice } from "./picker";

export const dynamic = "force-dynamic";

/** E12 매칭 실패: 다른 날로 옮기기(추천 회차 펼침) / 이용권 보관 / 환불받기 */
export default async function Resolve({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,match_reason,round_id,near_ok,areas,application_slots(slots(region))")
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; match_status: string; match_reason: string | null; round_id: string; near_ok: boolean | null; areas: string[] | null; application_slots: { slots: { region: string } }[] } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  if (app.match_status !== "ALTERNATIVE_OFFERED") redirect(`/applications/${id}`);

  const liked = new Set([...(app.areas ?? []), ...app.application_slots.map((s) => s.slots.region)]);
  const likedSido = new Set([...liked].map((a) => sidoOf(a)).filter(Boolean));
  const t = await now();
  const { data: rounds } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(id,region,sido,starts_at,application_slots(count))")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .neq("id", app.round_id)
    .order("apply_deadline")
    .limit(3);

  // 추천: 고른 동네 → 같은 시·도 → 그 밖의 순, 같은 순위면 신청자가 많은 곳
  type S = { id: string; region: string; sido: string | null; starts_at: string; application_slots: { count: number }[] };
  const options = ((rounds ?? []) as unknown as { id: string; apply_deadline: string; slots: S[] }[])
    .flatMap((r) => r.slots.map((s) => ({ s, deadline: r.apply_deadline })))
    .map(({ s, deadline }) => ({
      id: s.id,
      label: `${fmtSlot(s.starts_at).replace(/ (저녁|오후|낮|오전) .*$/, "")} · ${s.region}`,
      rank: liked.has(s.region) ? 0 : likedSido.has(s.sido ?? sidoOf(s.region) ?? "") ? 1 : 2,
      demand: s.application_slots?.[0]?.count ?? 0,
      note: (s.application_slots?.[0]?.count ?? 0) >= 4 ? "신청자 많아요" : `${fmtDay(deadline)} 마감`,
      hot: (s.application_slots?.[0]?.count ?? 0) >= 4,
      starts: s.starts_at,
    }))
    .sort((a, b) => a.rank - b.rank || b.demand - a.demand || a.starts.localeCompare(b.starts))
    .slice(0, 4);

  const reason = app.match_reason ?? "고른 동네에서 4명이 안 모였어요.";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <div className="pt-safe px-3"><div className="flex h-[52px] items-center"><BackButton href={`/applications/${id}`} /></div></div>
      <div className="flex items-start gap-4 px-6 pt-2">
        <div className="flex-1">
          <h1 className="text-[25px] font-extrabold leading-[1.38]">이번엔 테이블을<br />못 만들었어요</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{reason}</p>
        </div>
        <RoundTable size={84} filled={3} me label="세 자리만 찬 테이블" />
      </div>
      <div className="px-6"><ErrorText msg={e} /></div>
      <ResolveChoice appId={app.id} options={options} actions={{ transfer, keepPass, refund }} />
    </div>
  );
}
