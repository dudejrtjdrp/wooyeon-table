import Link from "next/link";
import { RoundTable } from "@/components/brand";
import { ErrorText, PasswordInput, PrimaryButton, Required, Screen } from "@/components/ui";
import { login } from "../actions";

/** A3 휴대폰 번호로 로그인 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  return (
    <Screen back="/login" title="휴대폰 번호로 로그인">
      <div className="mt-8 flex flex-col items-center text-center">
        <RoundTable size={110} filled={6} me={false} />
        <h2 className="animate-rise mt-7 text-[26px] font-extrabold text-ink">다시 만나서 반가워요</h2>
        <p className="mt-2 text-[16px] text-muted">따뜻한 저녁을 이어가 볼까요?</p>
      </div>
      <form action={login} className="mt-9 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="block rounded-[20px] bg-field px-5 pb-3 pt-4">
          <span className="text-[13px] font-semibold text-muted">휴대폰 번호<Required /></span>
          <input name="login_id" inputMode="tel" autoComplete="username" placeholder="010-1234-5678" className="mt-1 h-10 w-full bg-transparent text-[18px] text-ink outline-none placeholder:text-muted/50" />
        </label>
        <label className="block rounded-[20px] bg-field px-5 pb-3 pt-4">
          <span className="text-[13px] font-semibold text-muted">비밀번호<Required /></span>
          <PasswordInput name="password" autoComplete="current-password" placeholder="비밀번호" className="mt-1 h-10 w-full bg-transparent text-[18px] text-ink outline-none placeholder:text-muted/50" />
        </label>
        <ErrorText msg={e} />
        <div className="pt-3"><PrimaryButton type="submit" pendingText="로그인하는 중">로그인</PrimaryButton></div>
      </form>
      <p className="mt-7 text-center text-[15px] text-muted">
        처음이에요?{" "}
        <Link href="/signup" className="font-semibold text-accent">가입하기</Link>
      </p>
    </Screen>
  );
}
