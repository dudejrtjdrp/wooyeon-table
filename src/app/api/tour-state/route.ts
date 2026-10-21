import { NextResponse } from "next/server";
import { getMe, isActiveAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { tourSig } from "@/lib/tour";
import { tourSnapshot } from "@/lib/tour-state";

export const dynamic = "force-dynamic";

/**
 * 해커톤 심사 투어의 지금 단계 키만 돌려준다(가벼운 조회).
 * PC 진행 모달이 서버 응답이 늦거나 끊겨도 단계가 바뀌었는지 보고, 휴대폰 따라보기 화면이 새로고침할 때를 안다.
 * 운영자이거나 시연 참가자 계정일 때만
 */
export async function GET() {
  const admin = await getMe("admin");
  let ok = isActiveAdmin(admin);
  let userId: string | null = null;
  if (!ok) {
    const me = await getMe();
    if (me) {
      const { data } = await db().from("users").select("is_demo").eq("id", me.id).maybeSingle();
      ok = Boolean(data?.is_demo) && !me.login_id.startsWith("test-");
      userId = me.id;
    }
  }
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const s = await tourSnapshot();
  // 휴대폰(시연 참가자)이면 내 신청 상태도 같이: 단계는 그대로인데 내 상태만 바뀐 때도 새로 그리게
  const of = (r: typeof s.cur) => (userId ? r?.apps.find((a) => a.user_id === userId) : null);
  const sig = tourSig(s.step, of(s.cur), of(s.next));
  return NextResponse.json({ ok: true, step: s.step, sig }, { headers: { "Cache-Control": "no-store" } });
}
