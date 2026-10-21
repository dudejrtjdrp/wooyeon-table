"use client";

import { Route, AlertTriangle, History, CalendarRange, ChartNoAxesColumn, ChefHat, MapPin, CreditCard, Gauge, LayoutDashboard, MessageSquareText, MessagesSquare, ShieldCheck, SlidersHorizontal, UserCheck, UserSearch, Users, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 자주 여는 순서로 묶는다: 매일 보는 것 → 모임 주간에 보는 것 → 사람 찾기 → 다음 회차 준비 → 가끔 보는 기록.
// hint는 마우스를 올리면 뜨는 한 줄 설명(처음 온 운영자용). subs: 화면 안의 탭(그 메뉴에 있을 때 아래에 펼쳐 보인다)
type Item = { href: string; label: string; icon: typeof LayoutDashboard; hint: string; subs?: { href: string; label: string }[] };
const GROUPS: { name: string; items: Item[] }[] = [
  { name: "심사", items: [
    { href: "/admin/tour", label: "심사 투어", icon: Route, hint: "처음이면 여기부터. 버튼 하나씩 눌러 신청부터 다음 매칭까지 한 바퀴를 봐요" },
  ] },
  { name: "매일", items: [
    { href: "/admin", label: "오늘 처리할 일", icon: LayoutDashboard, hint: "지금 처리할 일과 이번 회차 진행 상황을 한눈에 봐요" },
    { href: "/admin/exceptions", label: "예외 처리함", icon: AlertTriangle, hint: "자동으로 풀지 못한 일만 모았어요. 건마다 버튼 하나로 처리해요" },
    { href: "/admin/attendance", label: "참석·취소·노쇼", icon: UserCheck, hint: "모임 날 체크인을 보고, 노쇼 후보를 확정하거나 참석으로 정정해요" },
  ] },
  { name: "매칭과 모임", items: [
    { href: "/admin/matching", label: "자동 매칭 모니터", icon: Gauge, hint: "마감 때 자동으로 꾸린 테이블, 점수와 이유, 못 든 사람을 봐요" },
    { href: "/admin/tables", label: "테이블·단체방", icon: UtensilsCrossed, hint: "테이블마다 참가자·식당·단체방·안내 발송을 보고 긴급 수정해요" },
  ] },
  { name: "참가자", items: [
    { href: "/admin/applicants", label: "신청자", icon: Users, hint: "회차별 신청자를 결제·매칭·참석 상태로 거르고 CSV로 내려받아요" },
    { href: "/admin/members", label: "회원 찾기", icon: UserSearch, hint: "회차와 상관없이 이름이나 연락처 뒤 4자리로 회원을 찾아요" },
    { href: "/admin/payments", label: "결제·환불", icon: CreditCard, hint: "결제·자동 환불·환불 실패·이용권 사용 내역을 보고 직접 환불해요" },
    { href: "/admin/feedback", label: "피드백·안전", icon: ShieldCheck, hint: "만족도·후기, 안전 신고, 사람별 선호·차단을 탭으로 나눠 봐요", subs: [
      { href: "/admin/feedback", label: "만족도·후기" },
      { href: "/admin/feedback/reports", label: "안전 신고" },
      { href: "/admin/feedback/person", label: "사람별 매칭 반영" },
    ] },
  ] },
  { name: "다음 회차 준비", items: [
    { href: "/admin/rounds", label: "회차·식당 재고", icon: CalendarRange, hint: "회차를 만들고 일정별 식당이 받을 수 있는 테이블 수를 정해요" },
    { href: "/admin/venues", label: "식당 관리", icon: ChefHat, hint: "제휴 식당을 넣고 고치고, 사진과 엑셀로 한 번에 올려요" },
    { href: "/admin/messages", label: "자동 메시지", icon: MessageSquareText, hint: "발송 이력과 실패를 보고, 공지를 보내고, 알림 문구를 고쳐요(탭 세 개)", subs: [
      { href: "/admin/messages", label: "발송 이력" },
      { href: "/admin/messages/notice", label: "공지 보내기" },
      { href: "/admin/messages/templates", label: "문구 템플릿" },
    ] },
    { href: "/admin/contents", label: "대화 콘텐츠", icon: MessagesSquare, hint: "모임 시작 때 단체방에 올라갈 대화 주제와 아이스브레이킹을 관리해요" },
    { href: "/admin/demand", label: "새 동네 요청", icon: MapPin, hint: "아직 안 연 동네에 '열리면 알려 주세요'를 남긴 사람 수예요. 다음에 열 곳을 고를 때 봐요" },
  ] },
  { name: "기록과 설정", items: [
    { href: "/admin/metrics", label: "운영 지표", icon: ChartNoAxesColumn, hint: "자동 확정률·운영자 개입률 같은 핵심 지표 13개와 계산법을 봐요" },
    { href: "/admin/audit", label: "변경 이력", icon: History, hint: "누가 언제 무엇을 바꿨는지 봐요. 매칭 기준·문구는 여기서 되돌려요" },
    { href: "/admin/settings", label: "매칭 기준·계정", icon: SlidersHorizontal, hint: "매칭 점수 가중치·최소 점수와 운영자 계정·권한을 관리해요" },
  ] },
];

export function AdminNav({ exCount, mobile }: { exCount: number; mobile?: boolean }) {
  const path = usePathname();
  const on = (h: string) => (h === "/admin" ? path === "/admin" : path.startsWith(h));
  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2">
        {GROUPS.flatMap((g) => g.items).map(({ href, label, hint }) => (
          <Link key={href} href={href} title={hint} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${on(href) ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}>
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="mt-6 flex flex-col gap-3">
      {GROUPS.map((g) => (
        <div key={g.name}>
          <p className="px-3 pb-1.5 text-[12px] font-semibold text-muted/80">{g.name}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, icon: Icon, hint, subs }) => (
              <div key={href}>
                <Link
                  href={href}
                  title={hint}
                  aria-current={on(href) && !subs ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${on(href) ? "bg-accent-soft font-semibold text-accent" : "text-ink/80 hover:bg-accent-soft/40"}`}
                >
                  <Icon size={19} strokeWidth={on(href) ? 2.2 : 1.8} />
                  <span className="flex-1">{label}</span>
                  {href === "/admin/exceptions" && exCount > 0 && (
                    <span className="min-w-[22px] rounded-full bg-danger px-1.5 text-center text-[12px] font-bold leading-[22px] text-white">{exCount}</span>
                  )}
                </Link>
                {subs && on(href) && (
                  <div className="ml-[22px] mt-0.5 flex flex-col border-l border-line pl-3">
                    {subs.map((x) => {
                      const cur = path === x.href || (x.href !== href && path.startsWith(`${x.href}/`));
                      return (
                        <Link key={x.href} href={x.href} aria-current={cur ? "page" : undefined} className={`rounded-lg px-2.5 py-1.5 text-[14px] ${cur ? "font-semibold text-accent" : "text-muted hover:text-ink"}`}>
                          {x.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
