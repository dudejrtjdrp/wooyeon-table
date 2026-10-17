import { ChevronDown } from "lucide-react";
import { PageTitle, Screen } from "@/components/ui";

const FAQ: [string, string][] = [
  ["테이블은 어떻게 정해지나요?", "신청 마감 시각에 연령대, 성비, 관심사, 성향을 함께 보고 4~6명씩 자동으로 묶어요. 전에 만난 사람이나 다시 만나고 싶지 않다고 한 사람과는 같은 테이블에 앉지 않아요."],
  ["날짜와 동네를 여러 개 골라도 되나요?", "네, 많이 고를수록 테이블이 잘 꾸려져요. 확정은 그중 한 곳으로만 돼요."],
  ["매칭이 안 되면 어떻게 되나요?", "빈자리가 있는 테이블에 바로 앉거나, 다른 일정으로 옮기거나, 자리가 나길 기다릴 수 있어요. 1회권은 이용권 보관이나 환불도 고를 수 있고, 멤버십은 실패할 때마다 기간을 7일 늘려 드려요. 3일 안에 고르지 않으면 1회권은 이용권으로 보관해요."],
  ["식사비는 따로 내나요?", "네, 이용권은 매칭과 예약 비용이고 식사비는 현장에서 각자 계산해요."],
  ["취소하고 싶어요", "매칭 시각 전에는 신청 화면에서 바로 취소할 수 있고 전액 돌려드려요. 매칭과 환불은 모임 주 화요일 밤 12시에 함께 마감돼서, 확정 뒤에는 환불이 안 돼요(매칭이 안 됐을 때는 빼고). 멤버십은 매칭이 안 되면 기간을 7일 늘려 드려요."],
  ["모임에 못 가게 되면요?", "당일 취소는 안 돼요. 늦을 것 같으면 단체방의 '늦을 것 같아요'로 알려 주세요. 연락 없이 오지 않으면 노쇼로 기록되고, 90일 안에 첫 번째는 안내만, 두 번째는 30일 동안 신청이 막혀요. 세 번째부터는 운영팀이 이용 제한을 검토하고, 검토가 끝날 때까지는 신청이 잠시 막혀요. 사정이 있었다면 아래 '문의하기'로 알려 주시면 확인 뒤 풀어 드려요."],
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
      <section className="relative z-10 mt-8 rounded-[20px] bg-field p-5">
        <p className="text-[17px] font-bold text-ink">찾는 답이 없나요?</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">신청이나 결제가 이상하거나, 상태가 오래 그대로면 알려 주세요. 누르면 메일 앱이 열려요(받는 곳 help@wooyeon-table.app).</p>
        <a
          href={`mailto:help@wooyeon-table.app?subject=${encodeURIComponent("[우연한 식탁] 문의")}`}
          className="mt-4 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-extrabold text-white active:scale-[.985]"
        >
          문의하기
        </a>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">모임에서 불편한 일이 있었다면 테이블 화면 아래 &lsquo;신고하기&rsquo;가 더 빨라요.</p>
      </section>
    </Screen>
  );
}
