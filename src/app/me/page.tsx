import { ChevronRight, FileText, Headphones, LogOut, Shield, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PushToggle } from "@/components/push-toggle";
import { ConfirmSheet, List, Row, SectionTitle, TabScreen, Toast } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { logout } from "../login/actions";
import { withdraw } from "./actions";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", naver: "네이버", google: "Google" };

const MenuRow = ({ href, icon, label, right }: { href: string; icon: ReactNode; label: string; right?: ReactNode }) => (
  <Row href={href} right={right ?? <ChevronRight size={20} className="text-muted" />}>
    <span className="flex items-center gap-3 text-[16px]">
      <span className="text-muted">{icon}</span>
      {label}
    </span>
  </Row>
);

export default async function Me({ searchParams }: { searchParams: Promise<{ done?: string; m?: string; e?: string }> }) {
  const { done, m, e } = await searchParams;
  const me = await requireMe();
  const [{ data: ids }, { data: passes }, { count: attended }] = await Promise.all([
    db().from("user_identities").select("provider").eq("user_id", me.id),
    db().from("passes").select("remaining,expires_at").eq("user_id", me.id).gt("remaining", 0),
    db().from("applications").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("attendance_status", "ATTENDED"),
  ]);
  const via = (ids ?? []).map((i) => PROVIDER_LABEL[i.provider]).filter(Boolean);
  const left = (passes ?? []).reduce((n, p) => n + p.remaining, 0);

  return (
    <TabScreen title="내 정보">
      <Toast msg={done === "feedback" ? "후기 고마워요. 다음 테이블을 꾸릴 때 반영할게요" : m} />
      <Toast msg={e} tone="danger" />
      <Link href="/onboarding?next=/me" className="mt-2 flex items-center gap-4 rounded-3xl bg-card p-5">
        {me.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar_url} alt="" className="size-14 rounded-full object-cover" />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-[20px] font-bold text-accent">
            {me.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[19px] font-bold">{me.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {via.length ? `${via.join(", ")}로 로그인` : me.phone ? me.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3") : me.email ?? ""}
          </p>
        </div>
        <ChevronRight size={20} className="text-muted" />
      </Link>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-card p-5">
          <p className="text-[13px] text-muted">함께한 식탁</p>
          <p className="mt-1 text-[24px] font-bold">{attended ?? 0}번</p>
        </div>
        <Link href="/rounds" className="rounded-3xl bg-card p-5">
          <p className="text-[13px] text-muted">남은 이용권</p>
          <p className="mt-1 text-[24px] font-bold">{left}회</p>
        </Link>
      </div>

      <SectionTitle>계정</SectionTitle>
      <List>
        <PushToggle />
        <MenuRow href="/onboarding?next=/me" icon={<UserRound size={20} />} label="프로필과 매칭 정보" />
        <MenuRow href="/my-tables" icon={<Ticket size={20} />} label="신청·결제 내역" />
      </List>

      <SectionTitle>도움</SectionTitle>
      <List>
        <MenuRow href="/help" icon={<Headphones size={20} />} label="자주 묻는 질문과 문의" />
        <MenuRow href="/terms" icon={<FileText size={20} />} label="이용약관" />
        <MenuRow href="/privacy" icon={<Shield size={20} />} label="개인정보 처리방침" />
      </List>

      <div className="mt-3">
        <ConfirmSheet
          trigger={
            <button className="flex w-full items-center gap-3 rounded-3xl bg-card px-5 py-4 text-[16px]">
              <LogOut size={20} className="text-muted" /> 로그아웃
            </button>
          }
          title="로그아웃할까요?"
          body="다시 들어올 때는 같은 방법으로 로그인하면 돼요."
          confirmLabel="로그아웃"
          action={logout}
          hidden={{}}
          tone="accent"
        />
      </div>
      <div className="mt-6 text-center">
        <ConfirmSheet
          trigger={<button className="text-[13px] text-muted underline underline-offset-4">회원 탈퇴</button>}
          title="정말 탈퇴할까요?"
          body={<>이름, 연락처, 프로필과 매칭 정보는 바로 지워져요. 결제 기록은 법에 따라 5년, 신고 기록은 1년 동안 이름 없이 보관해요. 남은 이용권은 사라져요.</>}
          confirmLabel="탈퇴하기"
          action={withdraw}
          hidden={{}}
        />
      </div>
      <p className="mt-6 text-center text-[12px] text-muted">우연한 식탁 1.0</p>
    </TabScreen>
  );
}
