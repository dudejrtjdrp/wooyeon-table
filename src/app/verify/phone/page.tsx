import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { requireMe, safeNext } from "@/lib/auth";
import { smsEnabled } from "@/lib/sms";
import { db } from "@/lib/supabase";
import { PhoneVerifyForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * 휴대폰 문자 인증 화면.
 * ※ 임시 단계: 사업자 등록 후 PASS 본인인증(PortOne, src/app/onboarding/pass-button.tsx)으로 대체할 화면이에요.
 *   PASS가 열리면 온보딩 첫 단계에서 이 화면 대신 PASS 인증을 띄운다 (idvEnabled() 참고).
 */
export default async function VerifyPhone({ searchParams }: { searchParams: Promise<{ next?: string; auto?: string }> }) {
  const me = await requireMe();
  const { next: raw, auto } = await searchParams;
  const next = safeNext(raw) ?? "/onboarding";
  // 번호로 막 가입한 사람: 가입한 번호로 인증번호를 바로 보낸다 (이미 인증된 번호면 다시 받지 않고 넘어간다)
  const { data: u } = await db().from("users").select("phone_verified_at").eq("id", me.id).single();
  if (auto === "1" && u?.phone_verified_at) redirect(next);
  return (
    <Screen title="휴대폰 인증" back={next}>
      <PhoneVerifyForm initialPhone={me.phone ?? ""} next={next} demo={!smsEnabled()} autoSend={auto === "1" && Boolean(me.phone)} />
    </Screen>
  );
}
