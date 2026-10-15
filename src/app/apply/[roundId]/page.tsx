import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { usablePass } from "@/lib/billing";
import { now } from "@/lib/clock";
import { PASSES, REFUND_POLICY } from "@/lib/constants";
import { fmtDay, fmtSlot } from "@/lib/format";
import { SIDOS, kstDay } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { submitApplication } from "./actions";
import { ApplyFlow } from "./flow";

export const dynamic = "force-dynamic";

/** 신청 3단계: 지역(E07) → 날짜(E08) → 이용권·결제(E09) */
export default async function Apply({ params, searchParams }: { params: Promise<{ roundId: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const t = await now();
  const owned = await usablePass(me.id, t);
  const { roundId } = await params;
  const { e } = await searchParams;
  const { data: round } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,match_at,slots(id,region,sido,starts_at)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) notFound();

  // 많이 고르는 묶음과 시·도를 앞에 둔다 (이번 회차 신청 기준)
  const { data: picks } = await db().from("applications").select("areas").eq("round_id", roundId).neq("application_status", "CANCELED");
  const count = new Map<string, number>();
  for (const a of picks ?? []) for (const x of (a.areas as string[] | null) ?? []) count.set(x, (count.get(x) ?? 0) + 1);
  const open = new Set(round.slots.map((s) => s.region));
  const sidos = SIDOS.map((s, i) => ({
    name: s.name,
    order: i,
    score: s.areas.reduce((n, a) => n + (count.get(a) ?? 0), 0) + (s.areas.some((a) => open.has(a)) ? 1000 : 0),
    areas: s.areas.map((a) => ({ name: a, open: open.has(a), picks: count.get(a) ?? 0 })),
  })).sort((a, b) => b.score - a.score || a.order - b.order);
  const hot = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, n]) => n >= 2).map(([a]) => a);

  const slots = round.slots.map((s) => ({ id: s.id, region: s.region, sido: s.sido ?? null, day: kstDay(s.starts_at), label: fmtSlot(s.starts_at), startsAt: s.starts_at }));

  return (
    <ApplyFlow
      action={submitApplication}
      round={{ id: round.id, title: round.title, deadline: fmtSlot(round.apply_deadline), today: kstDay(t.toISOString()) }}
      sidos={sidos.map(({ name, areas }) => ({ name, areas: areas.map(({ name: n, open: o }) => ({ name: n, open: o })) }))}
      hot={hot}
      slots={slots}
      passes={Object.entries(PASSES).map(([k, p]) => ({ key: k, label: p.label, amount: p.amount, desc: p.desc }))}
      owned={owned ? { label: PASSES[owned.pass_type as keyof typeof PASSES]?.label ?? "이용권", remaining: owned.remaining, until: owned.expires_at ? fmtDay(owned.expires_at) : null } : null}
      refund={REFUND_POLICY}
      error={e}
    />
  );
}
