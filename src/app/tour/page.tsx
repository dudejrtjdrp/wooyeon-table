import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 예전 '투어 따라보기' 주소. 휴대폰에서는 설명 없이 앱만 쓰게 한다(성효님 결정 2026-10-21):
 * 설명은 PC 투어 화면에만 두고, 이 주소로 오면 앱 첫 화면으로 보낸다. 로그인은 PC에 적힌 시연 계정으로 직접
 */
export default function TourPage() {
  redirect("/");
}
