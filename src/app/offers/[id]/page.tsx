import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { ErrorText, LinkButton, List, Pill, PrimaryButton, Row, Screen, Toast } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtClock, fmtSlot } from "@/lib/format";
import { tableMembers } from "@/lib/attendance";
import { db } from "@/lib/supabase";
import { answerOffer } from "./actions";

export const dynamic = "force-dynamic";

const STATE: Record<string, [string, "accent" | "leaf" | "muted" | "danger"]> = {
  pending: ["답을 기다려요", "accent"],
  accepted: ["합류했어요", "leaf"],
  declined: ["거절했어요", "muted"],
  expired: ["기한이 지났어요", "muted"],
  void: ["마감됐어요", "muted"],
};

export default async function Offer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e, m } = await searchParams;
  const { data } = await db()
    .from("seat_offers")
    .select("id,user_id,status,expires_at,application_id,table_id,dining_tables(id,slots(starts_at,ends_at,region),venues(name,address,price_range))")
    .eq("id", id)
    .maybeSingle();
  const o = data as unknown as {
    id: string; user_id: string; status: string; expires_at: string; application_id: string; table_id: string;
    dining_tables: { id: string; slots: { starts_at: string; ends_at: string; region: string }; venues: { name: string; address: string; price_range: string | null } | null };
  } | null;
  if (!o || o.user_id !== me.id) redirect(`/?m=${encodeURIComponent("이 자리 제안을 찾지 못했어요. 알림함에서 다시 확인해 주세요")}`);
  const t = await now();
  const pending = o.status === "pending" && new Date(o.expires_at) > t;
  const left = Math.max(0, new Date(o.expires_at).getTime() - t.getTime());
  const hours = Math.floor(left / 3600_000);
  const mins = Math.floor((left % 3600_000) / 60_000);
  const count = (await tableMembers(o.table_id)).length;
  const s = o.dining_tables.slots;
  const [stateLabel, tone] = STATE[pending ? "pending" : o.status === "pending" ? "expired" : o.status] ?? STATE.void;

  return (
    <Screen title="빈자리 제안" back="/notifications">
      <Toast msg={m} />
      <section className="relative mt-2 overflow-hidden rounded-[24px] bg-field p-6">
        <div className="flex items-start justify-between">
          <RoundTable size={80} filled={5} />
          <Pill tone={tone}>{stateLabel}</Pill>
        </div>
        <p className="mt-5 text-[13px] text-muted">기다리던 자리가 났어요</p>
        <p className="mt-1 text-[22px] font-bold leading-snug tracking-[-0.02em]">
          {fmtSlot(s.starts_at)}
          <br />
          {s.region} 테이블에 한 자리가 비었어요
        </p>
        {pending ? (
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            <b className="text-ink">{fmtSlot(o.expires_at)}</b>까지 답해 주세요. 남은 시간 {hours ? `${hours}시간 ` : ""}{mins}분.
            답이 없으면 다음 분께 자리가 넘어가요.
          </p>
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-muted">이 제안은 끝났어요. 지금 신청은 그대로 남아 있어요.</p>
        )}
      </section>

      <List className="mt-3">
        <Row right={<span className="text-right text-[14px] font-medium">{`${fmtClock(s.starts_at)}~${fmtClock(s.ends_at)}`}</span>}><span className="text-[14px] text-muted">시간</span></Row>
        <Row right={<span className="text-right text-[14px] font-medium">{s.region}</span>}><span className="text-[14px] text-muted">지역</span></Row>
        <Row right={<span className="text-right text-[14px] font-medium">{o.dining_tables.venues?.name ?? "정해지는 대로 알려드려요"}</span>}><span className="text-[14px] text-muted">식당</span></Row>
        {o.dining_tables.venues?.price_range ? <Row right={<span className="text-right text-[14px] font-medium">{o.dining_tables.venues.price_range}</span>}><span className="text-[14px] text-muted">가격대</span></Row> : null}
        <Row right={<span className="text-right text-[14px] font-medium">{`지금 ${count}명`}</span>}><span className="text-[14px] text-muted">함께할 분</span></Row>
        <Row right={<span className="text-right text-[14px] font-medium">추가 결제 없음</span>}><span className="text-[14px] text-muted">결제</span></Row>
      </List>

      <div className="mt-4"><ErrorText msg={e} /></div>
      {pending ? (
        <form action={answerOffer} className="mt-4 space-y-2.5">
          <input type="hidden" name="offer_id" value={o.id} />
          <PrimaryButton name="answer" value="accept" pendingText="합류하는 중">이 테이블에 합류할게요</PrimaryButton>
          <PrimaryButton name="answer" value="decline" tone="light">이번엔 괜찮아요</PrimaryButton>
          <p className="pt-1 text-center text-[12px] text-muted">거절해도 다른 일정 이동·보관·환불은 그대로 고를 수 있어요.</p>
        </form>
      ) : (
        <div className="mt-4"><LinkButton href={`/applications/${o.application_id}`}>내 신청 보기</LinkButton></div>
      )}
    </Screen>
  );
}
