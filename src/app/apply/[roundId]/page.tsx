import { notFound } from "next/navigation";
import { ErrorText, PrimaryButton, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { PASSES, REFUND_POLICY, won } from "@/lib/constants";
import { dateKey, fmtDate, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { submitApplication } from "./actions";

export default async function Apply({ params, searchParams }: { params: Promise<{ roundId: string }>; searchParams: Promise<{ e?: string }> }) {
  await requireProfile();
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
    <Screen title="신청하기" back="/rounds">
      <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em]">{round.title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">갈 수 있는 날짜와 동네를 모두 골라 주세요. 많이 고를수록 테이블이 잘 잡혀요.</p>

      <form action={submitApplication} className="mt-6 space-y-8 pb-24">
        <input type="hidden" name="round_id" value={round.id} />

        <section className="space-y-3">
          {[...byDate.entries()].map(([d, slots]) => (
            <div key={d} className="rounded-3xl bg-card p-4">
              <p className="text-[16px] font-bold">
                {fmtDate(slots[0].starts_at)} <span className="ml-1 font-medium text-muted">{fmtTime(slots[0].starts_at)}</span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <label key={s.id} className="cursor-pointer">
                    <input type="checkbox" name="slot_ids" value={s.id} className="peer sr-only" />
                    <span className="block rounded-2xl border border-line py-3.5 text-center text-[15px] transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                      {s.region}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section>
          <p className="text-[17px] font-bold">이용권</p>
          <div className="mt-2 space-y-2">
            {Object.entries(PASSES).map(([k, p], i) => (
              <label key={k} className="block cursor-pointer">
                <input type="radio" name="pass" value={k} defaultChecked={i === 0} className="peer sr-only" />
                <span className="flex items-center justify-between rounded-2xl border-2 border-transparent bg-card px-4 py-4 transition peer-checked:border-accent">
                  <span>
                    <span className="block text-[15px] font-medium">{p.label}</span>
                    <span className="block text-[13px] text-muted">{p.desc}</span>
                  </span>
                  <span className="text-[16px] font-bold">{won(p.amount)}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">식사비는 이용권과 별도로 현장에서 각자 계산해요.</p>
        </section>

        <section className="rounded-3xl bg-card p-5">
          <p className="text-[15px] font-semibold">환불 규정</p>
          <ul className="mt-2 space-y-1 text-[14px] leading-relaxed text-muted">
            {REFUND_POLICY.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
            ))}
          </ul>
          <label className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-[15px] font-semibold">
            <input type="checkbox" name="agree_refund" className="size-5 accent-[var(--accent)]" />
            환불 규정을 확인했어요
          </label>
        </section>

        <ErrorText msg={e} />
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3"><PrimaryButton type="submit" pendingText="신청서 보내는 중">신청하고 결제하기</PrimaryButton></div>
        </div>
      </form>
    </Screen>
  );
}
