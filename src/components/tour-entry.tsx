import { isDemoHuman } from "@/lib/demo-panel";
import { db } from "@/lib/supabase";
import { TourFollow } from "@/app/tour/follow";

/**
 * 시연 참가자 계정이면 PC에서 투어 버튼을 누를 때 홈이 저절로 새로 그려지게 한다. 화면에는 아무것도 그리지 않는다.
 * 휴대폰은 설명 없이 평소 앱처럼 쓰고, 설명은 PC 투어 화면에만 둔다(성효님 결정 2026-10-21)
 */
export async function TourEntry({ userId }: { userId: string }) {
  const { data: u } = await db().from("users").select("login_id,is_demo").eq("id", userId).maybeSingle();
  if (!isDemoHuman(u)) return null;
  return <TourFollow sig="" />;
}
