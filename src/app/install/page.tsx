import { Screen } from "@/components/ui";
import { InstallGuide } from "@/components/pwa";

export const metadata = { title: "앱 설치하기 · 우연한 식탁" };

export default function Install() {
  return (
    <Screen title="앱 설치하기" back="/">
      <section className="shadow-card mt-2 rounded-[24px] bg-card p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="size-14 rounded-[16px]" />
        <p className="mt-4 text-[20px] font-bold leading-snug tracking-[-0.02em]">
          홈 화면에 우연한 식탁을
          <br />
          설치해 주세요
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">앱스토어 없이 30초면 끝나요. 설치하면 매칭 결과, 모임 하루 전 안내, 단체방 새 메시지를 휴대폰 알림으로 받아요.</p>
      </section>
      <InstallGuide />
    </Screen>
  );
}
