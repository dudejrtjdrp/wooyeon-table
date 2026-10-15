import Link from "next/link";
import { ErrorText, Field, PasswordInput, PageTitle, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { signup } from "../login/actions";

/** A3-signup 휴대폰 번호로 가입하기 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <Screen back="/login" title="휴대폰 번호로 가입하기">
      <div className="mt-4">
        <PageTitle title="휴대폰 번호로" accent="시작해요" sub="기본 정보만 입력하면 시작할 수 있어요." />
      </div>
      <form action={signup} className="mt-8">
        <div className="space-y-6">
          <Field label="이름" required>
            <input name="name" autoComplete="name" placeholder="이름" className={inputCls} />
          </Field>
          <Field label="휴대폰 번호" required>
            <input name="phone" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" className={inputCls} />
          </Field>
          <div>
            <Field label="비밀번호" required>
              <PasswordInput name="password" autoComplete="new-password" placeholder="비밀번호" className={inputCls} />
            </Field>
            <p className="mt-2 text-[13px] text-muted">6자 이상 입력해 주세요.</p>
          </div>
        </div>
        <div className="mt-4"><ErrorText msg={e} /></div>
        <div className="mt-6"><PrimaryButton type="submit" pendingText="가입하는 중">가입하기</PrimaryButton></div>
      </form>
      <p className="mt-7 text-center text-[15px] text-muted">
        이미 계정이 있나요?{" "}
        <Link href="/login/phone" className="font-semibold text-accent">로그인</Link>
      </p>
    </Screen>
  );
}
