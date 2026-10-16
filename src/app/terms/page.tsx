import { DocPage } from "@/components/doc";
import { TermsBody } from "@/components/legal";

export const metadata = { title: "이용약관 | 우연한 식탁" };

export default function Terms() {
  return (
    <DocPage title="이용약관" updated="2026년 10월 16일">
      <TermsBody />
    </DocPage>
  );
}
