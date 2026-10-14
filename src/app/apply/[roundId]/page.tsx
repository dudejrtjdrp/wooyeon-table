import { notFound } from "next/navigation";
import { CalendarDays, Check, Info } from "lucide-react";
import { Backdrop, ErrorText, IMG, PageTitle, PrimaryButton, Required, Screen, SectionCard } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { usablePass } from "@/lib/billing";
import { now } from "@/lib/clock";
import { PASSES, REFUND_POLICY, won } from "@/lib/constants";
import { dateKey, fmtDay, fmtSlot } from "@/lib/format";
import { db } from "@/lib/supabase";
import { submitApplication } from "./actions";

export default async function Apply({ params, searchParams }: { params: Promise<{ roundId: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const owned = await usablePass(me.id, await now());
  const { roundId } = await params;
  const { e } = await searchParams;
  const { data: round } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,match_at,slots(id,region,starts_at)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) notFound();

  const byDate = new Map<string, { id: string; region: string; starts_at: string }[]>();
  for (const s of [...round.slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.region.localeCompare(b.region))) {
    const k = dateKey(s.starts_at);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(s);
  }

  return (
    <Screen title="신청하기" back="/rounds" backdrop={<Backdrop src={IMG.sharedDishes} side height={260} position="center" />}>
      <PageTitle className="mt-4" title={round.title} sub="갈 수 있는 일정을 모두 골라 주세요." />

      <form action={submitApplication} className="mt-7 space-y-3 pb-24">
        <input type="hidden" name="round_id" value={round.id} />

        <SectionCard title="갈 수 있는 날짜와 동네" required>
          <div className="divide-y divide-line">
            {[...byDate.entries()].map(([d, slots]) => (
              <div key={d} className="py-4 first:pt-0 last:pb-0">
                <p className="flex items-center gap-2.5 text-[17px] font-bold text-ink">
                  <CalendarDays size={20} className="text-accent" />
                  {fmtSlot(slots[0].starts_at)}
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <label key={s.id} className="cursor-pointer">
                      <input type="checkbox" name="slot_ids" value={s.id} className="peer sr-only" />
                      <span className="flex h-12 items-center justify-center gap-1 rounded-full border border-line bg-card text-[15px] text-ink transition duration-150 peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 [&>svg]:hidden peer-checked:[&>svg]:block">
                        {s.region}
                        <Check size={16} strokeWidth={2.8} />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="이용권" required>
          <div className="space-y-2.5">
            {owned && (
              <label className="block cursor-pointer">
                <input type="radio" name="pass" value="owned" defaultChecked className="peer sr-only" />
                <span className="flex items-center gap-4 rounded-2xl border border-line bg-card px-4 py-4 transition peer-checked:border-accent peer-checked:bg-accent-soft/30 peer-checked:ring-1 peer-checked:ring-accent [&_.dot]:scale-0 peer-checked:[&_.dot]:scale-100 peer-checked:[&_.ring]:border-accent">
                  <span className="ring flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-line transition"><span className="dot size-3 rounded-full bg-accent transition" /></span>
                  <span className="flex-1">
                    <span className="block text-[17px] font-bold text-ink">가지고 있는 이용권 쓰기 0원</span>
                    <span className="mt-0.5 block text-[14px] text-muted">
                      {PASSES[owned.pass_type as keyof typeof PASSES]?.label ?? "이용권"} 남은 {owned.remaining}회{owned.expires_at ? `, ${fmtDay(owned.expires_at)}까지` : ""}
                    </span>
                  </span>
                </span>
              </label>
            )}
            {Object.entries(PASSES).map(([k, p], i) => (
              <label key={k} className="block cursor-pointer">
                <input type="radio" name="pass" value={k} defaultChecked={!owned && i === 0} className="peer sr-only" />
                <span className="flex items-center gap-4 rounded-2xl border border-line bg-card px-4 py-4 transition peer-checked:border-accent peer-checked:bg-accent-soft/30 peer-checked:ring-1 peer-checked:ring-accent [&_.dot]:scale-0 peer-checked:[&_.dot]:scale-100 peer-checked:[&_.ring]:border-accent">
                  <span className="ring flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-line transition"><span className="dot size-3 rounded-full bg-accent transition" /></span>
                  <span className="flex-1">
                    <span className="block text-[17px] font-bold text-ink">{p.label} {won(p.amount)}</span>
                    <span className="mt-0.5 block text-[14px] text-muted">{p.desc}</span>
                  </span>
                </span>
              </label>
            ))}
            <p className="flex items-center gap-2.5 rounded-2xl bg-field px-4 py-3.5 text-[14px] text-muted">
              <Info size={18} className="shrink-0 fill-muted text-white" />식사비는 현장에서 각자 계산해요.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="환불 규정" right={<span className="text-[13px] text-muted">결제 전에 꼭 확인해 주세요.</span>}>
          <ol className="space-y-2.5 rounded-2xl bg-field p-4">
            {REFUND_POLICY.map((r, i) => (
              <li key={r} className="flex gap-3 text-[14px] leading-relaxed text-[#4c5368]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-[12px] font-semibold text-muted">{i + 1}</span>
                {r}
              </li>
            ))}
          </ol>
          <label className="mt-4 flex cursor-pointer items-center gap-3 border-t border-line pt-4">
            <input type="checkbox" name="agree_refund" className="peer sr-only" />
            <span className="flex size-7 items-center justify-center rounded-lg border-2 border-line text-white transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40"><Check size={18} strokeWidth={3} /></span>
            <span className="text-[16px] font-semibold text-ink">환불 규정을 확인했어요.<Required /></span>
          </label>
        </SectionCard>

        <ErrorText msg={e} />
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3"><PrimaryButton type="submit" pendingText="신청서 보내는 중">신청하고 결제하기</PrimaryButton></div>
        </div>
      </form>
    </Screen>
  );
}
