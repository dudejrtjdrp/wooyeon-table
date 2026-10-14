import { DocPage } from "@/components/doc";
import { PrivacyBody } from "@/components/legal";

export const metadata = { title: "개인정보 처리방침 | 우연한 식탁" };

export default function Privacy() {
  return (
    <DocPage title="개인정보 처리방침" updated="2026년 10월 21일">
      <PrivacyBody />
    </DocPage>
  );
}
