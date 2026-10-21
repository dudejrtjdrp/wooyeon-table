import { Bell, ChevronRight, CircleHelp, FileText, ShieldCheck, ReceiptText, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmSheet, List, Row, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { isMembership } from "@/lib/constants";
import { fmtDay } from "@/lib/format";
import { db } from "@/lib/supabase";
import { logout } from "../login/actions";
import { withdraw } from "./actions";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", naver: "네이버", google: "Google" };

const MenuRow = ({ href, icon, label, right }: { href: string; icon: ReactNode; label: string; right?: ReactNode }) => (
  <Row href={href} right={right ?? <ChevronRight size={20} className="text-muted" />}>
    <span className="flex items-center gap-3.5 text-[16px] font-semibold text-ink">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
      {label}
    </span>
  </Row>
);

export default async function Me({ searchParams }: { searchParams: Promise<{ done?: string; m?: string; e?: string }> }) {
  const { done, m, e } = await searchParams;
  const me = await requireMe();
  const [{ data: ids }, { data: passes }, { count: attended }] = await Promise.all([
    db().from("user_identities").select("provider").eq("user_id", me.id),
    db().from("passes").select("pass_type,remaining,expires_at").eq("user_id", me.id),
    db().from("applications").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("attendance_status", "ATTENDED"),
  ]);
  const via = (ids ?? []).map((i) => PROVIDER_LABEL[i.provider]).filter(Boolean);
  const t = new Date();
  const live = (passes ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > t);
  const member = live.filter((p) => isMembership(p.pass_type)).sort((a, b) => (b.expires_at ?? "").localeCompare(a.expires_at ?? ""))[0];
  const left = live.filter((p) => !isMembership(p.pass_type)).reduce((n, p) => n + p.remaining, 0);
  // 1회권도 기한을 보여 준다(신청 시각 기준). 남은 횟수가 있는 것 중 가장 빨리 끝나는 것
  const soonest = live.filter((p) => !isMembership(p.pass_type) && p.remaining > 0 && p.expires_at).sort((a, b) => a.expires_at!.localeCompare(b.expires_at!))[0];

  return (
    <TabScreen title="내 정보">
      <Toast msg={done === "feedback" ? "고마워요. 다음 테이블을 꾸릴 때 반영할게요" : m} />
      <Toast msg={e} tone="danger" />
      <section className="mt-5 overflow-hidden rounded-[24px] bg-card">
        <Link href="/onboarding?next=/me" className="flex items-center gap-4 px-5 pt-5">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt="" className="size-[60px] rounded-full object-cover" />
          ) : (
            <span className="flex size-[60px] items-center justify-center rounded-full bg-accent text-[22px] font-bold text-accent-ink">
              {me.name.slice(-2, -1) || me.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-bold text-ink">{me.name}</p>
            <p className="mt-0.5 truncate text-[14px] text-muted">
              {via.length ? `${via.join(", ")}로 로그인` : me.phone ? me.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3") : me.email ?? ""}
            </p>
          </div>
          <ChevronRight size={22} className="text-muted" />
        </Link>
        <div className="mx-5 mt-5 grid grid-cols-2 border-t border-line py-4">
          <Link href="/my-tables" className="text-center">
            <p className="text-[14px] text-muted">함께한 테이블</p>
            <p className="mt-1 text-[26px] font-bold text-accent">{attended ?? 0}번</p>
          </Link>
          <Link href="/rounds" className="border-l border-line text-center">
            <p className="text-[14px] text-muted">{member ? "멤버십" : "남은 이용권"}</p>
            <p className="mt-1 text-[26px] font-bold text-accent">{member?.expires_at ? `${fmtDay(member.expires_at).replace(/\s*\(.\)$/, "")}까지` : `${left}회`}</p>
            {member?.expires_at && <p className="mt-0.5 text-[13px] text-muted">이날까지 신청 가능</p>}
            {!member && soonest?.expires_at && <p className="mt-0.5 text-[13px] text-muted">{fmtDay(soonest.expires_at).replace(/\s*\(.\)$/, "")}까지 신청 가능</p>}
            {member && left > 0 && <p className="mt-0.5 text-[13px] text-muted">이용권 {left}회도 있어요</p>}
          </Link>
        </div>
      </section>

      <SectionTitle>계정</SectionTitle>
      <List>
        <MenuRow href="/onboarding?next=/me" icon={<UserRound size={20} />} label="프로필과 매칭 정보" />
        <MenuRow href="/rounds" icon={<ReceiptText size={20} />} label="신청·결제 내역" />
        <MenuRow href="/settings" icon={<Bell size={20} />} label="알림과 앱 설치" />
      </List>

      <SectionTitle>도움</SectionTitle>
      <List>
        <MenuRow href="/help" icon={<CircleHelp size={20} />} label="자주 묻는 질문과 문의" />
        <MenuRow href="/terms" icon={<FileText size={20} />} label="이용약관" />
        <MenuRow href="/privacy" icon={<ShieldCheck size={20} />} label="개인정보 처리방침" />
      </List>

      <div className="mt-8 text-center">
        <ConfirmSheet
          trigger={<button className="inline-flex h-11 items-center px-4 text-[15px] font-semibold text-ink2">로그아웃</button>}
          title="로그아웃할까요?"
          body="다시 들어올 때는 같은 방법으로 로그인하면 돼요."
          confirmLabel="로그아웃"
          action={logout}
          hidden={{}}
          tone="accent"
        />
        <p className="text-[12px] text-muted">앱 버전 1.0.0</p>
      </div>
      <div className="mt-4 text-center">
        <ConfirmSheet
          trigger={<button className="inline-flex h-11 items-center px-4 text-[13px] text-muted underline underline-offset-4">회원 탈퇴</button>}
          title="정말 탈퇴할까요?"
          body={<>이름, 연락처, 프로필과 매칭 정보는 바로 지워져요. 결제 기록은 법에 따라 5년, 신고 기록은 1년 동안 이름 없이 보관해요. 남은 이용권은 사라져요.</>}
          confirmLabel="탈퇴하기"
          action={withdraw}
          hidden={{}}
        />
      </div>
    </TabScreen>
  );
}
