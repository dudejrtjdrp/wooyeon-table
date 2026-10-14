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
      <h2 className="mt-2 text-[22px] font-bold">{round.title}</h2>
      <p className="mt-1 text-[14px] text-muted">갈 수 있는 날짜와 동네를 모두 골라 주세요. 많이 고를수록 테이블이 잘 잡혀요.</p>

      <form action={submitApplication} className="mt-6 space-y-8">
        <input type="hidden" name="round_id" value={round.id} />

        <section className="space-y-4">
          {[...byDate.entries()].map(([d, slots]) => (
            <div key={d}>
              <p className="text-[15px] font-semibold">
                {fmtDate(slots[0].starts_at)} <span className="font-normal text-muted">{fmtTime(slots[0].starts_at)}</span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <label key={s.id} className="cursor-pointer">
                    <input type="checkbox" name="slot_ids" value={s.id} className="peer sr-only" />
                    <span className="block rounded-xl border border-line bg-card py-3 text-center text-[15px] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">
                      {s.region}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section>
          <p className="text-[15px] font-semibold">이용권</p>
          <div className="mt-2 space-y-2">
            {Object.entries(PASSES).map(([k, p], i) => (
              <label key={k} className="block cursor-pointer">
                <input type="radio" name="pass" value={k} defaultChecked={i === 0} className="peer sr-only" />
                <span className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3.5 peer-checked:border-ink peer-checked:ring-1 peer-checked:ring-ink">
                  <span>
                    <span className="block text-[15px] font-medium">{p.label}</span>
                    <span className="block text-[13px] text-muted">{p.desc}</span>
                  </span>
                  <span className="text-[15px] font-semibold">{won(p.amount)}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">식사비는 이용권과 별도로 현장에서 각자 계산해요.</p>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <p className="text-[15px] font-semibold">환불 규정</p>
          <ul className="mt-2 space-y-1 text-[14px] leading-relaxed text-muted">
            {REFUND_POLICY.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-3 text-[14px]">
            <input type="checkbox" name="agree_refund" className="size-5 accent-[var(--ink)]" />
            확인했어요
          </label>
        </section>

        <ErrorText msg={e} />
        <PrimaryButton type="submit">신청하고 결제하기</PrimaryButton>
      </form>
    </Screen>
  );
}
