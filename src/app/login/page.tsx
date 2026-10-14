import Link from "next/link";
import { ErrorText, Field, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  return (
    <Screen back="/">
      <h1 className="mt-4 text-[26px] font-bold leading-snug">다시 만나서 반가워요</h1>
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
        <PrimaryButton type="submit">로그인</PrimaryButton>
      </form>
      <p className="mt-6 text-center text-[14px] text-muted">
        처음이에요?{" "}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
          가입하기
        </Link>
      </p>
      <div className="mt-10 rounded-xl bg-line/40 p-4 text-[13px] leading-relaxed text-muted">
        <p className="font-medium text-ink">심사용 테스트 계정</p>
        <p className="mt-1">
          <Link href="/guide" className="underline underline-offset-4">심사위원 안내</Link>에서 바로 로그인할 수 있어요.
        </p>
      </div>
    </Screen>
  );
}
