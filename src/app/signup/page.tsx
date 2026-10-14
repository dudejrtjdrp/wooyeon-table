import Link from "next/link";
import { ErrorText, Field, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { signup } from "../login/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <Screen back="/">
      <h1 className="mt-4 text-[26px] font-bold leading-snug">
        우연한 식탁에
        <br />
        오신 걸 환영해요
      </h1>
      <p className="mt-2 text-[15px] text-muted">가입은 1분이면 끝나요. 모임 안내도 이 번호로 보내드려요.</p>
      <form action={signup} className="mt-8 space-y-4">
        <Field label="이름">
          <input name="name" autoComplete="name" placeholder="홍길동" className={inputCls} />
        </Field>
        <Field label="휴대폰 번호">
          <input name="phone" inputMode="tel" autoComplete="tel" placeholder="01012345678" className={inputCls} />
        </Field>
        <Field label="비밀번호" hint="6자 이상">
          <input name="password" type="password" autoComplete="new-password" className={inputCls} />
        </Field>
        <ErrorText msg={e} />
        <PrimaryButton type="submit">가입하고 시작하기</PrimaryButton>
      </form>
      <p className="mt-6 text-center text-[14px] text-muted">
        이미 계정이 있어요{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          로그인
        </Link>
      </p>
    </Screen>
  );
}
