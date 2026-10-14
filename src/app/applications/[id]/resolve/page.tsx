import { redirect } from "next/navigation";
import { ErrorText, PrimaryButton, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { keepPass, refund, transfer } from "./actions";

export const dynamic = "force-dynamic";

export default async function Resolve({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select("id,user_id,match_status,match_reason,round_id,application_slots(slots(region))")
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as { id: string; user_id: string; match_status: string; match_reason: string | null; round_id: string; application_slots: { slots: { region: string } }[] } | null;
  if (!app || app.user_id !== me.id) redirect("/");
  if (app.match_status !== "ALTERNATIVE_OFFERED") redirect(`/applications/${id}`);

  const liked = new Set(app.application_slots.map((s) => s.slots.region));
  const t = await now();
  const { data: rounds } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,slots(id,region,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .neq("id", app.round_id)
    .order("apply_deadline")
    .limit(2);

  return (
    <Screen title="다음 방법 고르기" back={`/applications/${id}`}>
      <div className="mt-2 rounded-3xl bg-card p-5">
        <p className="text-[17px] font-semibold">이번에는 맞는 테이블이 없었어요</p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{app.match_reason ?? "조건에 맞는 테이블을 찾지 못했어요."} 아래 세 가지 중 편한 방법을 골라 주세요.</p>
      </div>
      <div className="mt-3"><ErrorText msg={e} /></div>

      <section className="mt-6">
        <h2 className="text-[16px] font-semibold">1. 다른 일정으로 옮기기</h2>
        <p className="mt-1 text-[13px] text-muted">결제는 그대로 두고 새 일정의 매칭 대기로 옮겨요. 전에 고른 동네를 먼저 보여드려요.</p>
        {!rounds?.length && <p className="mt-3 text-[14px] text-muted">지금 옮길 수 있는 일정이 없어요.</p>}
        {rounds?.map((r) => {
          const slots = [...r.slots].sort((a, b) => Number(liked.has(b.region)) - Number(liked.has(a.region)) || a.starts_at.localeCompare(b.starts_at));
          return (
            <form key={r.id} action={transfer} className="mt-3 rounded-3xl bg-card p-5">
              <input type="hidden" name="app_id" value={app.id} />
              <p className="text-[15px] font-semibold">{r.title}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <label key={s.id} className="cursor-pointer">
                    <input type="checkbox" name="slot_ids" value={s.id} defaultChecked={liked.has(s.region)} className="peer sr-only" />
                    <span className="block rounded-xl border border-line py-2.5 text-center text-[13px] peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white">
                      {fmtDate(s.starts_at)} {fmtTime(s.starts_at)}
                      <br />
                      <b>{s.region}</b>
                    </span>
                  </label>
                ))}
              </div>
              <PrimaryButton type="submit" className="mt-3">이 일정으로 옮기기</PrimaryButton>
            </form>
          );
        })}
      </section>

      <section className="mt-8 grid gap-3">
        <form action={keepPass} className="rounded-3xl bg-card p-5">
          <input type="hidden" name="app_id" value={app.id} />
          <h2 className="text-[16px] font-semibold">2. 이용권 보관하기</h2>
          <p className="mt-1 text-[13px] text-muted">이번에 쓴 1회를 돌려드려요. 나중에 원하는 일정에 쓰면 돼요.</p>
          <PrimaryButton tone="light" className="mt-3">보관하기</PrimaryButton>
        </form>
        <form action={refund} className="rounded-3xl bg-card p-5">
          <input type="hidden" name="app_id" value={app.id} />
          <h2 className="text-[16px] font-semibold">3. 환불받기</h2>
          <p className="mt-1 text-[13px] text-muted">계좌를 따로 알려주지 않아도 결제한 수단으로 바로 돌려드려요.</p>
          <PrimaryButton tone="light" className="mt-3">환불받기</PrimaryButton>
        </form>
      </section>
    </Screen>
  );
}
