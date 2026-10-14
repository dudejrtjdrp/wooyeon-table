import Link from "next/link";
import { ErrorText, Field, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  return (
    <Screen back="/login" title="휴대폰 번호로 로그인">
      <h2 className="mt-4 text-[24px] font-bold leading-snug tracking-[-0.02em]">다시 만나서 반가워요</h2>
      <p className="mt-2 text-[15px] text-muted">가입할 때 쓴 휴대폰 번호로 로그인해 주세요.</p>
      <form action={login} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next ?? "/"} />
        <Field label="휴대폰 번호">
          <input name="login_id" inputMode="tel" autoComplete="username" placeholder="01012345678" className={inputCls} />
        </Field>
        <Field label="비밀번호">
          <input name="password" type="password" autoComplete="current-password" className={inputCls} />
        </Field>
        <ErrorText msg={e} />
        <PrimaryButton type="submit" pendingText="로그인하는 중">로그인</PrimaryButton>
      </form>
      <p className="mt-6 text-center text-[14px] text-muted">
        처음이에요?{" "}
        <Link href="/signup" className="font-semibold text-accent">
          가입하기
        </Link>
      </p>
    </Screen>
  );
}
