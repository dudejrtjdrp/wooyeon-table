import { ChevronDown } from "lucide-react";
import { Screen } from "@/components/ui";

const FAQ: [string, string][] = [
  ["테이블은 어떻게 정해지나요?", "신청 마감 시각에 연령대, 성비, 관심사, 성향을 함께 보고 4~6명씩 자동으로 묶어요. 전에 만난 사람이나 다시 만나고 싶지 않다고 한 사람과는 같은 테이블에 앉지 않아요."],
  ["날짜와 동네를 여러 개 골라도 되나요?", "네, 많이 고를수록 테이블이 잘 꾸려져요. 확정은 그중 한 곳으로만 돼요."],
  ["매칭이 안 되면 어떻게 되나요?", "다른 일정으로 옮기거나, 이용권을 보관하거나, 환불받을 수 있어요. 알림에서 바로 고를 수 있어요."],
  ["식사비는 따로 내나요?", "네, 이용권은 매칭과 예약 비용이고 식사비는 현장에서 각자 계산해요."],
  ["취소하고 싶어요", "매칭 시각 전에는 신청 화면에서 바로 취소할 수 있고 전액 돌려드려요. 확정 뒤에는 모임 2일 전까지 환불돼요."],
  ["불편한 일이 있었어요", "테이블 화면 아래 '신고하기'로 남겨 주세요. 상대에게 알리지 않고 바로 차단하며, 운영팀이 확인해요."],
];

export default function Help() {
  return (
    <Screen title="자주 묻는 질문" back="/me">
      <div className="mt-2 divide-y divide-line overflow-hidden rounded-3xl bg-card">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[15px] font-semibold">
              {q}
              <ChevronDown size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
            </summary>
            <p className="pb-4 text-[14px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Screen>
  );
}
