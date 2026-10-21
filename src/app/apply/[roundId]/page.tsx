import { notFound } from "next/navigation";
import { acceptsSlot } from "@/lib/policy";
import { requireProfile } from "@/lib/auth";
import { usablePass } from "@/lib/billing";
import { now } from "@/lib/clock";
import { LEGACY_PASS_LABEL, PASSES, REFUND_POLICY, isMembership } from "@/lib/constants";
import { fmtDay, fmtSlot } from "@/lib/format";
import { membershipNudge } from "@/lib/recommend";
import { SIDOS, kstDay } from "@/lib/regions";
import { LinkButton, Screen } from "@/components/ui";
import { db } from "@/lib/supabase";
import { submitApplication } from "./actions";
import { ApplyFlow } from "./flow";

export const dynamic = "force-dynamic";

/** 신청 3단계: 지역(E07) → 날짜(E08) → 이용권·결제(E09) */
export default async function Apply({ params, searchParams }: { params: Promise<{ roundId: string }>; searchParams: Promise<{ e?: string; step?: string }> }) {
  const me = await requireProfile();
  const t = await now();
  const owned = await usablePass(me.id, t);
  const { roundId } = await params;
  const { e, step } = await searchParams;
  const { data: round } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,match_at,slots(id,region,sido,starts_at)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) notFound();

  // 이미 신청한 회차(결제를 마치고 뒤로 온 경우 등): 신청 폼을 다시 보여 주지 않고 내 신청으로 안내한다
  const { data: mine } = await db().from("applications").select("id,payment_status").eq("user_id", me.id).eq("round_id", roundId).neq("application_status", "CANCELED").limit(1).maybeSingle();
  if (mine) {
    // 결제 화면에서 뒤로 온 경우: 신청은 이미 만들어졌으니 결제만 이어서 하게 한다
    const payLeft = (mine.payment_status === "PENDING" || mine.payment_status === "FAILED") && new Date(round.match_at) > t;
    return (
      <Screen title="신청" back="/rounds">
        <div className="px-6 pt-10 text-center">
          <p className="text-[20px] font-extrabold text-ink">{payLeft ? "결제만 남았어요" : "이미 신청한 일정이에요"}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{payLeft ? `${round.title} 신청은 받아 뒀어요. 결제를 마치면 매칭 대상이 돼요.` : `${round.title} 신청 상태는 내 신청에서 볼 수 있어요.`}</p>
          <LinkButton href={payLeft ? `/pay/${mine.id}` : `/applications/${mine.id}`} className="mt-8">{payLeft ? "결제 이어서 하기" : "내 신청 보기"}</LinkButton>
          {payLeft && <LinkButton href={`/applications/${mine.id}`} tone="outline" className="mt-2.5">내 신청 보기</LinkButton>}
        </div>
      </Screen>
    );
  }

  // 모든 날이 환불 마감(모임 주 화요일 밤 12시)을 지났으면 신청 화면 대신 이유와 갈 곳을 보여 준다
  if (!round.slots.some((s) => acceptsSlot(s.starts_at, t))) {
    return (
      <Screen title="신청" back="/rounds">
        <div className="px-6 pt-10 text-center">
          <p className="text-[20px] font-extrabold text-ink">이 일정은 신청이 끝났어요</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{round.title}의 모든 날이 환불 마감(모임 주 화요일 밤 12시)을 지났어요. 그 뒤에는 결과 전 취소도 환불도 안 돼서 신청을 받지 않아요.</p>
          <LinkButton href="/rounds" className="mt-8">모집 중인 일정 보기</LinkButton>
          <LinkButton href="/wish" tone="outline" className="mt-2.5">새 일정이 열리면 알림 받기</LinkButton>
        </div>
      </Screen>
    );
  }

  // 많이 고르는 묶음과 시·도를 앞에 둔다 (이번 회차 신청 기준)
  const { data: picks } = await db().from("applications").select("areas").eq("round_id", roundId).neq("application_status", "CANCELED");
  const count = new Map<string, number>();
  for (const a of picks ?? []) for (const x of (a.areas as string[] | null) ?? []) count.set(x, (count.get(x) ?? 0) + 1);
  const open = new Set(round.slots.filter((s) => acceptsSlot(s.starts_at, t)).map((s) => s.region));
  const sidos = SIDOS.map((s, i) => ({
    name: s.name,
    order: i,
    score: s.areas.reduce((n, a) => n + (count.get(a) ?? 0), 0) + (s.areas.some((a) => open.has(a)) ? 1000 : 0),
    areas: s.areas.map((a) => ({ name: a, open: open.has(a), picks: count.get(a) ?? 0 })),
  })).sort((a, b) => b.score - a.score || a.order - b.order);
  const hot = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, n]) => n >= 2).map(([a]) => a);

  // 두 번째 신청부터 멤버십을 권한다: 다른 회차에서 결제까지 한 신청이 있는지 (가진 이용권으로만 낸 신청은 결제가 아니라 세지 않는다)
  const { count: paidBefore } = await db().from("applications").select("id", { count: "exact", head: true }).eq("user_id", me.id).neq("round_id", roundId).not("payment_id", "is", null).eq("payment_status", "PAID"); // 환불만 받은 신청은 세지 않는다
  const nudge = membershipNudge(paidBefore ?? 0, Boolean(owned), PASSES.single.amount, PASSES.m1.amount);

  // 환불 마감이 지난 날은 신청을 받지 않는다(달력에서 '마감'으로 보인다)
  const closedDays = [...new Set(round.slots.filter((s) => !acceptsSlot(s.starts_at, t)).map((s) => kstDay(s.starts_at)))];
  const slots = round.slots.filter((s) => acceptsSlot(s.starts_at, t)).map((s) => ({ id: s.id, region: s.region, sido: s.sido ?? null, day: kstDay(s.starts_at), label: fmtSlot(s.starts_at), startsAt: s.starts_at }));

  return (
    <ApplyFlow
      action={submitApplication}
      round={{ id: round.id, title: round.title, deadline: fmtSlot(round.apply_deadline), today: kstDay(t.toISOString()) }}
      sidos={sidos.map(({ name, areas }) => ({ name, areas: areas.map(({ name: n, open: o }) => ({ name: n, open: o })) }))}
      hot={hot}
      slots={slots}
      closedDays={closedDays}
      passes={Object.entries(PASSES).map(([k, p]) => ({ key: k, label: p.label, amount: p.amount, desc: p.desc }))}
      owned={owned ? { label: PASSES[owned.pass_type as keyof typeof PASSES]?.label ?? LEGACY_PASS_LABEL[owned.pass_type] ?? "이용권", remaining: owned.remaining, unlimited: isMembership(owned.pass_type), until: owned.expires_at ? fmtDay(owned.expires_at) : null } : null}
      refund={REFUND_POLICY}
      nudge={nudge}
      error={e}
      initialStep={Math.min(Math.max(Number(step) || 1, 1), 3)}
    />
  );
}
