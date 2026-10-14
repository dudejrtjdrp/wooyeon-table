import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";

/** 답을 기다리는 빈자리 제안이 있으면 맨 위에 띄운다 (STA-07) */
export async function OfferBanner({ userId, applicationId }: { userId: string; applicationId?: string }) {
  const t = await now();
  let q = db()
    .from("seat_offers")
    .select("id,expires_at,dining_tables(slots(starts_at,region))")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", t.toISOString())
    .order("expires_at")
    .limit(1);
  if (applicationId) q = q.eq("application_id", applicationId);
  const { data } = await q;
  const o = (data ?? [])[0] as unknown as { id: string; expires_at: string; dining_tables: { slots: { starts_at: string; region: string } } } | undefined;
  if (!o) return null;
  const s = o.dining_tables.slots;
  return (
    <Link href={`/offers/${o.id}`} className="mt-5 flex items-center gap-4 rounded-3xl bg-ink p-5 text-white">
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-candle/20">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-candle/30" />
        <span className="size-3 rounded-full bg-candle" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-white/60">{fmtTime(o.expires_at)}까지 답해 주세요</span>
        <span className="mt-0.5 block text-[16px] font-bold leading-snug">
          {fmtDate(s.starts_at)} {s.region} 테이블에 자리가 났어요
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-white/50" />
    </Link>
  );
}
