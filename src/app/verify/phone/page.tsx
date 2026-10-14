import { Screen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { smsEnabled } from "@/lib/sms";
import { PhoneVerifyForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * 휴대폰 문자 인증 화면.
 * ※ 임시 단계: 사업자 등록 후 PASS 본인인증(PortOne, src/app/onboarding/pass-button.tsx)으로 대체할 화면이에요.
 *   PASS가 열리면 온보딩 첫 단계에서 이 화면 대신 PASS 인증을 띄운다 (idvEnabled() 참고).
 */
export default async function VerifyPhone({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await requireMe();
  const { next } = await searchParams;
  return (
    <Screen title="휴대폰 인증" back={next?.startsWith("/") ? next : "/onboarding"}>
      <PhoneVerifyForm initialPhone={me.phone ?? ""} next={next?.startsWith("/") ? next : "/onboarding"} demo={!smsEnabled()} />
    </Screen>
  );
}
