import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, RotateCcw } from "lucide-react";
import { Backdrop, ConfirmSheet, ErrorText, IMG, Optional, PageTitle, Pill, PrimaryButton, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtSlot } from "@/lib/format";
import { db } from "@/lib/supabase";
import { keepPass, refund, transfer } from "./actions";
import { TransferPicker } from "./picker";

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

  // 날짜·시간별 선택지 (한 번에 한 차수로만 옮길 수 있어서 선택지마다 차수가 정해진다)
  const options = (rounds ?? []).flatMap((r) => {
    const byTime = new Map<string, { id: string; region: string }[]>();
    for (const sl of [...r.slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      if (!byTime.has(sl.starts_at)) byTime.set(sl.starts_at, []);
      byTime.get(sl.starts_at)!.push({ id: sl.id, region: sl.region });
    }
    return [...byTime.entries()].map(([iso, slots]) => ({ key: `${r.id}|${iso}`, label: fmtSlot(iso), slots }));
  });

  return (
    <Screen title="돌아가기" back={`/applications/${id}`} backdrop={<Backdrop src={IMG.waitingCorner} side height={330} position="center" />}>
      <PageTitle className="mt-4" title="이번엔 맞는 테이블이" accent="없었어요" sub={app.match_reason ?? "선택한 일정에서 테이블을 꾸리기 어려웠어요."} />
      <div className="mt-3"><ErrorText msg={e} /></div>

      <form action={transfer} className="shadow-card mt-7 rounded-[24px] bg-card p-5">
        <input type="hidden" name="app_id" value={app.id} />
        <Pill tone="accent">추천</Pill>
        <h2 className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-ink">다른 일정으로 옮기기</h2>
        <p className="mt-1 text-[15px] text-muted">결제는 그대로 유지돼요.</p>
        {options.length ? (
          <>
            <TransferPicker options={options} liked={[...liked]} />
            <PrimaryButton type="submit" className="mt-5" pendingText="옮기는 중">이 일정으로 옮기기</PrimaryButton>
          </>
        ) : (
          <p className="mt-4 rounded-2xl bg-field px-4 py-3.5 text-[14px] text-muted">지금 옮길 수 있는 일정이 없어요. 이용권을 보관해 두면 다음 일정에 쓸 수 있어요.</p>
        )}
      </form>

      <div className="mt-3 space-y-3">
        <ConfirmSheet
          trigger={<OptionRow icon={<CalendarDays size={22} />} title="이용권 보관하기" desc="다음에 그대로 사용할 수 있어요." />}
          title="이용권을 보관할까요?"
          body="이번에 쓴 1회를 돌려드려요. 나중에 원하는 일정을 신청할 때 그대로 쓸 수 있어요."
          confirmLabel="보관하기"
          action={keepPass}
          hidden={{ app_id: app.id }}
          tone="accent"
        />
        <ConfirmSheet
          trigger={<OptionRow icon={<RotateCcw size={22} />} title="환불받기" desc="원래 결제 수단으로 자동 환불해요." />}
          title="환불받을까요?"
          body="계좌를 따로 알려주지 않아도 결제한 수단으로 바로 돌려드려요. 카드사에 따라 며칠 걸릴 수 있어요."
          confirmLabel="환불받기"
          action={refund}
          hidden={{ app_id: app.id }}
        />
      </div>
    </Screen>
  );
}

function OptionRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" className="shadow-card flex w-full items-center gap-4 rounded-[22px] bg-card p-5 text-left active:scale-[.99]">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
      <span className="flex-1">
        <span className="text-[18px] font-bold text-ink">{title}</span><Optional />
        <span className="mt-1 block text-[14px] text-muted">{desc}</span>
      </span>
      <ChevronRight size={22} className="text-muted" />
    </button>
  );
}
