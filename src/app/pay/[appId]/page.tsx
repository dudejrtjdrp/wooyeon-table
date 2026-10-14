import { redirect } from "next/navigation";
import { Card, ErrorText, PrimaryButton, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { PASSES, REFUND_POLICY, type PassType, won } from "@/lib/constants";
import { db } from "@/lib/supabase";
import { failPayment, pay } from "./actions";

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
    <Screen title="결제" back="/">
      <Card className="mt-2">
        <p className="text-[14px] text-muted">{app.rounds.title}</p>
        <div className="mt-2 flex items-end justify-between">
          <p className="text-[17px] font-semibold">{passDef.label}</p>
          <p className="text-[22px] font-bold">{won(app.payments.amount)}</p>
        </div>
      </Card>

      <div className="mt-4 rounded-xl bg-line/40 p-4 text-[13px] leading-relaxed text-muted">
        해커톤 시연용 모의 결제예요. 실제로 돈이 나가지 않아요.
      </div>

      <ul className="mt-6 space-y-1 text-[13px] leading-relaxed text-muted">
        {REFUND_POLICY.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>

      <div className="mt-6 space-y-3">
        <ErrorText msg={e} />
        <form action={pay}>
          <input type="hidden" name="app_id" value={app.id} />
          <PrimaryButton type="submit">{won(app.payments.amount)} 결제하기</PrimaryButton>
        </form>
        {app.payments.status === "PENDING" && (
          <form action={failPayment} className="text-center">
            <input type="hidden" name="app_id" value={app.id} />
            <button className="text-[13px] text-muted underline underline-offset-4">결제 실패 상황 보기 (시연용)</button>
          </form>
        )}
      </div>
    </Screen>
  );
}
