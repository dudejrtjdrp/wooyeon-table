import Link from "next/link";
import { db } from "@/lib/supabase";
import { demoLogin } from "./actions";

export const dynamic = "force-dynamic";

export default async function Guide() {
  const { data: demo } = await db()
    .from("users")
    .select("login_id,name,role")
    .eq("is_demo", true)
    .order("role")
    .order("login_id")
    .limit(12);
  const admin = (demo ?? []).find((u) => u.role === "admin");
  const users = (demo ?? []).filter((u) => u.role === "user");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-sm font-medium text-accent">심사위원 안내</p>
      <h1 className="mt-2 text-[26px] font-bold">이 순서로 둘러보시면 돼요</h1>
      <p className="mt-3 leading-relaxed text-muted">
        우연한 식탁은 신청부터 매칭, 식당·단체방 안내, 피드백까지 운영자 손 없이 돌아가는 것을 목표로 만들었어요.
        마감 시각을 기다리지 않아도 되도록 어드민에 시연 패널을 두었어요.
      </p>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold">1. 시연 계정으로 들어가기</h2>
        <p className="mt-1 text-[14px] text-muted">비밀번호 없이 바로 들어가요. 참가자 화면은 휴대폰 크기로 보시면 좋아요.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {admin && (
            <form action={demoLogin}>
              <input type="hidden" name="login_id" value={admin.login_id} />
              <button className="w-full rounded-xl bg-ink px-4 py-3 text-left text-white">
                <span className="block text-[15px] font-semibold">운영자 어드민</span>
                <span className="block text-[12px] opacity-70">아이디 {admin.login_id}</span>
              </button>
            </form>
          )}
          {users.map((u) => (
            <form key={u.login_id} action={demoLogin}>
              <input type="hidden" name="login_id" value={u.login_id} />
              <button className="w-full rounded-xl border border-line bg-card px-4 py-3 text-left">
                <span className="block text-[15px] font-semibold">참가자 {u.name}</span>
                <span className="block text-[12px] text-muted">{u.login_id}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          직접 로그인하려면 테스트 계정 비밀번호를 쓰세요. 참가자 <code>demo1234</code>, 운영자 <code>admin1234</code>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold">2. 추천 순서</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
          <li>참가자로 들어가 일정을 고르고 모의 결제까지 해 보세요.</li>
          <li>운영자로 들어가 시연 패널에서 테스트 참가자를 만들고, 시각을 매칭 마감으로 옮겨 보세요.</li>
          <li>자동 매칭 결과와 매칭 이유, 재배치·실패 내역을 확인해 보세요.</li>
          <li>참가자로 돌아가 테이블, 식당, 단체방 공지를 확인해 보세요.</li>
          <li>시각을 모임 종료로 옮긴 뒤 체크인과 후기를 남기고, 다음 매칭에 반영되는지 보세요.</li>
        </ol>
      </section>

      <p className="mt-10 text-[14px]">
        <Link href="/" className="underline underline-offset-4">참가자 앱으로</Link>
        <span className="mx-2 text-muted">·</span>
        <Link href="/admin" className="underline underline-offset-4">어드민으로</Link>
      </p>
    </main>
  );
}
