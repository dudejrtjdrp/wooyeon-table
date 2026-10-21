import { ChevronRight, Monitor } from "lucide-react";
import Link from "next/link";
import { isDemoHuman } from "@/lib/demo-panel";
import { db } from "@/lib/supabase";
import { TOUR_NAME } from "@/lib/tour";

/** 홈 위 작은 입구: 시연 참가자 계정일 때만 '해커톤 심사 투어 따라보기'. 일반 회원에게는 아무것도 안 그린다 */
export async function TourEntry({ userId }: { userId: string }) {
  const { data: u } = await db().from("users").select("login_id,is_demo").eq("id", userId).maybeSingle();
  if (!isDemoHuman(u)) return null;
  return (
    <Link href="/tour" className="mt-2 flex min-h-11 items-center gap-2 rounded-[14px] bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper">
      <Monitor size={16} aria-hidden="true" />
      <span className="min-w-0 flex-1">{TOUR_NAME} 따라보기</span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
