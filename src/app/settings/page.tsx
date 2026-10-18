import { PushToggle } from "@/components/push-toggle";
import { InstallCard } from "@/components/pwa";
import { List, Screen } from "@/components/ui";
import { requireMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 내 정보 > 알림과 앱 설치: 계정 메뉴 사이에 끼어 있던 설정을 따로 뺐다 */
export default async function Settings() {
  await requireMe();
  return (
    <Screen title="알림과 앱 설치" back="/me">
      <div className="flex flex-col gap-3 px-4 pt-4">
        <List>
          <PushToggle />
        </List>
        <p className="px-1 text-[13px] leading-relaxed text-muted">테이블 확정, 하루 전 안내, 모임 시작 알림을 휴대폰으로 받아요. 알림함에는 항상 남아요.</p>
        <InstallCard />
      </div>
    </Screen>
  );
}
