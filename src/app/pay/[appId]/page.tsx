import { redirect } from "next/navigation";
import { ChevronDown, Clock3, Ticket } from "lucide-react";
import { ErrorText, LinkButton, PageTitle, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { PASSES, PAY_DEMO_HINT, REFUND_POLICY, type PassType, won } from "@/lib/constants";
import { fmtSlot } from "@/lib/format";
import { now } from "@/lib/clock";
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
    .select("id,user_id,payment_id,payment_status,rounds(title,match_at),payments(amount,pass_type,status)")
    .eq("id", appId)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; payment_id: string; payment_status: string; rounds: { title: string; match_at: string }; payments: { amount: number; pass_type: PassType; status: string } } | null;
  if (!app || app.user_id !== me.id) redirect(`/?m=${encodeURIComponent("이 결제 화면을 찾지 못했어요. 내 신청은 일정 탭에서 볼 수 있어요")}`);
  if (app.payments.status === "PAID") redirect(`/applications/${appId}`);
  const passDef = PASSES[app.payments.pass_type] ?? PASSES.single;
  // 매칭 시각이 지난 뒤에는 결제를 받지 않는다. 받으면 이미 끝난 매칭에 돈만 내게 된다
  if (new Date(app.rounds.match_at) <= (await now())) {
    return (
      <Screen title="결제" back={`/applications/${appId}`}>
        <PageTitle className="mt-4" title="이 일정은" accent="신청이 마감됐어요" sub={`${app.rounds.title}은 ${fmtSlot(app.rounds.match_at)}에 테이블을 꾸렸어요. 결제 전이라 빠져나간 돈은 없어요.`} />
        <div className="mt-8"><LinkButton href="/rounds">모집 중인 일정 보기</LinkButton></div>
      </Screen>
    );
  }

  return (
    <Screen title="결제" back={`/applications/${appId}`}>
      <form className="pb-28">
        <input type="hidden" name="app_id" value={app.id} />
        <PageTitle className="mt-4" title="결제 내용을" accent="확인해 주세요" />

        <section className="mt-7 flex gap-4 rounded-[22px] bg-field p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold tracking-[-0.02em] text-ink">{app.rounds.title}</p>
            <p className="mt-4 flex items-center gap-2 text-[14px] text-ink2"><Ticket size={18} className="text-muted" />이용권 · {passDef.label}</p>
            <p className="mt-2.5 flex items-start gap-2 text-[13px] leading-snug text-ink2"><Clock3 size={18} className="shrink-0 text-muted" />{fmtSlot(app.rounds.match_at)}에 자동으로 테이블을 꾸려 알려 드려요</p>
          </div>
        </section>

        <section className="mt-3 rounded-[22px] bg-field p-5">
          <p className="text-[14px] text-muted">결제 금액</p>
          <p className="mt-1 text-[34px] font-black text-ink">{won(app.payments.amount)}</p>
          <p className="mt-1 text-[14px] text-muted">식사비는 현장에서 각자 계산해요.</p>
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

        <details className="group mt-3 rounded-[22px] bg-field">
          <summary className="flex cursor-pointer list-none items-center justify-between p-5">
            <span>
              <span className="block text-[16px] font-bold text-ink">환불 규정 확인하기</span>
              <span className="mt-0.5 block text-[13px] text-muted">모임 주 화요일 밤 12시까지는 전액 환불돼요.</span>
            </span>
            <ChevronDown size={20} className="text-muted transition group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 px-5 pb-5 text-[14px] leading-relaxed text-ink2">
            {REFUND_POLICY.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
            ))}
          </ul>
        </details>

        <div className="mt-4"><ErrorText msg={e} /></div>
        {!tossLive() && (
          <div className="mt-6 flex flex-col items-center gap-2.5 text-[13px] text-muted">
            {/* 테스트 결제창이 열리지 않거나 실패해 돌아온 경우(테스트 키 401 등): 시연은 아래 버튼으로 이어 가게 */}
            {e && <p className="rounded-[12px] bg-warn-soft px-4 py-2.5 text-center text-[14px] font-semibold text-[#6b5410]">{PAY_DEMO_HINT}</p>}
            <button formAction={pay} className="inline-flex h-11 items-center underline underline-offset-4">결제창 없이 바로 결제 완료 (시연용)</button>
            {app.payments.status === "PENDING" && (
              <button formAction={failPayment} className="inline-flex h-11 items-center underline underline-offset-4">결제 실패 상황 보기 (시연용)</button>
            )}
          </div>
        )}
      </form>
    </Screen>
  );
}
