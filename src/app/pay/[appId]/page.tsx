import { redirect } from "next/navigation";
import { ErrorText, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { PASSES, REFUND_POLICY, type PassType, won } from "@/lib/constants";
import { db } from "@/lib/supabase";
import { tossClientKey, tossLive } from "@/lib/toss";
import { failPayment, pay } from "./actions";
import { TossCheckout } from "./checkout";

export default async function Pay({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { appId } = await params;
  const { e } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select("id,user_id,payment_id,payment_status,rounds(title),payments(amount,pass_type,status)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payment_id: string; payment_status: string; rounds: { title: string }; payments: { amount: number; pass_type: PassType; status: string } } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  if (app.payments.status === "PAID") redirect(`/applications/${appId}`);
  const passDef = PASSES[app.payments.pass_type] ?? PASSES.single;

  return (
    <Screen title="결제" back={`/applications/${appId}`}>
      <form className="pb-28">
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

        <TossCheckout
          clientKey={tossClientKey()}
          live={tossLive()}
          customerKey={`wt_${me.id}`}
          customerName={me.name}
          appId={app.id}
          paymentId={app.payment_id}
          amount={app.payments.amount}
          amountText={won(app.payments.amount)}
          orderName={`우연한 식탁 ${passDef.label}`}
        />

        <section className="mt-3 rounded-3xl bg-card p-5">
          <p className="text-[15px] font-bold">환불 규정</p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
            {REFUND_POLICY.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
            ))}
          </ul>
        </section>

        <div className="mt-4"><ErrorText msg={e} /></div>
        {!tossLive() && (
          <div className="mt-6 flex flex-col items-center gap-2.5 text-[13px] text-muted">
            <button formAction={pay} className="underline underline-offset-4">결제창 없이 바로 결제 완료 (시연용)</button>
            {app.payments.status === "PENDING" && (
              <button formAction={failPayment} className="underline underline-offset-4">결제 실패 상황 보기 (시연용)</button>
            )}
          </div>
        )}
      </form>
    </Screen>
  );
}
