import { redirect } from "next/navigation";
import { ErrorText, PrimaryButton, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { PASSES, REFUND_POLICY, type PassType, won } from "@/lib/constants";
import { db } from "@/lib/supabase";
import { failPayment, pay } from "./actions";

const METHODS = [
  ["card", "신용·체크카드"],
  ["kakaopay", "카카오페이"],
  ["naverpay", "네이버페이"],
  ["tosspay", "토스페이"],
] as const;

export default async function Pay({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { appId } = await params;
  const { e } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select("id,user_id,payment_status,rounds(title),payments(amount,pass_type,status)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payment_status: string; rounds: { title: string }; payments: { amount: number; pass_type: PassType; status: string } } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  if (app.payments.status === "PAID") redirect(`/applications/${appId}`);
  const passDef = PASSES[app.payments.pass_type] ?? PASSES.single;

  return (
    <Screen title="결제" back={`/applications/${appId}`}>
      <form action={pay} className="pb-28">
        <input type="hidden" name="app_id" value={app.id} />
        <section className="mt-2 rounded-3xl bg-card p-5">
          <p className="text-[13px] text-muted">{app.rounds.title}</p>
          <p className="mt-1 text-[17px] font-bold">{passDef.label}</p>
          <p className="mt-0.5 text-[13px] text-muted">{passDef.desc}</p>
          <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
            <p className="text-[15px] font-semibold">결제 금액</p>
            <p className="text-[24px] font-bold tracking-[-0.02em]">{won(app.payments.amount)}</p>
          </div>
        </section>

        <section className="mt-3 rounded-3xl bg-card p-5">
          <p className="text-[17px] font-bold">결제 수단</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {METHODS.map(([v, l], i) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" name="method" value={v} defaultChecked={i === 0} className="peer sr-only" />
                <span className="block rounded-2xl border border-line py-3.5 text-center text-[15px] transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent">
                  {l}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
            지금은 시연용 모의 결제예요. 실제로 돈이 나가지 않아요.
          </p>
        </section>

        <section className="mt-3 rounded-3xl bg-card p-5">
          <p className="text-[15px] font-bold">환불 규정</p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
            {REFUND_POLICY.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
            ))}
          </ul>
        </section>

        <div className="mt-4"><ErrorText msg={e} /></div>
        {app.payments.status === "PENDING" && (
          <p className="mt-6 text-center">
            <button formAction={failPayment} className="text-[13px] text-muted underline underline-offset-4">결제 실패 상황 보기 (시연용)</button>
          </p>
        )}

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3">
            <PrimaryButton type="submit" pendingText="결제하는 중">{won(app.payments.amount)} 결제하기</PrimaryButton>
          </div>
        </div>
      </form>
    </Screen>
  );
}
