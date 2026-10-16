import { ChevronDown } from "lucide-react";
import { PageTitle, Screen } from "@/components/ui";

const FAQ: [string, string][] = [
  ["테이블은 어떻게 정해지나요?", "신청 마감 시각에 연령대, 성비, 관심사, 성향을 함께 보고 4~6명씩 자동으로 묶어요. 전에 만난 사람이나 다시 만나고 싶지 않다고 한 사람과는 같은 테이블에 앉지 않아요."],
  ["날짜와 동네를 여러 개 골라도 되나요?", "네, 많이 고를수록 테이블이 잘 꾸려져요. 확정은 그중 한 곳으로만 돼요."],
  ["매칭이 안 되면 어떻게 되나요?", "빈자리가 있는 테이블에 바로 앉거나, 다른 일정으로 옮기거나, 자리가 나길 기다릴 수 있어요. 1회권은 이용권 보관이나 환불도 고를 수 있고, 멤버십은 실패할 때마다 기간을 7일 늘려 드려요. 3일 안에 고르지 않으면 1회권은 이용권으로 보관해요."],
  ["식사비는 따로 내나요?", "네, 이용권은 매칭과 예약 비용이고 식사비는 현장에서 각자 계산해요."],
  ["취소하고 싶어요", "매칭 시각 전에는 신청 화면에서 바로 취소할 수 있고 전액 돌려드려요. 매칭과 환불은 모임 주 화요일 밤 12시에 함께 마감돼서, 확정 뒤에는 환불이 안 돼요(매칭이 안 됐을 때는 빼고). 멤버십은 매칭이 안 되면 기간을 7일 늘려 드려요."],
  ["불편한 일이 있었어요", "테이블 화면 아래 '신고하기'로 남겨 주세요. 상대에게 알리지 않고 바로 차단하며, 운영팀이 확인해요."],
];

export default function Help() {
  return (
    <Screen title="자주 묻는 질문" back="/me">
      <PageTitle className="mt-4" title="궁금한 점을" accent="먼저 확인해 보세요" />
      <div className="relative z-10 mt-7 space-y-3">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0} className="group rounded-[20px] bg-field">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[20px] px-5 py-5 text-[17px] font-bold tracking-[-0.02em] text-ink group-open:bg-accent-soft/40">
              {q}
              <ChevronDown size={22} className="shrink-0 text-accent transition group-open:rotate-180" />
            </summary>
            <p className="px-5 pb-5 pt-3 text-[15px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
      <p className="relative z-10 mt-6 text-center text-[14px] text-muted">
        더 궁금한 점은 <a href="mailto:help@wooyeon-table.app" className="font-semibold text-accent">help@wooyeon-table.app</a>으로 보내 주세요.
      </p>
    </Screen>
  );
}
