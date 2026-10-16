import Link from "next/link";
import { safeNext } from "@/lib/auth";
import { ErrorText, Field, PasswordInput, PageTitle, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { signup } from "../login/actions";

/** A3-signup 휴대폰 번호로 가입하기 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const n = safeNext(next) ?? "";
  const q = n ? `?next=${encodeURIComponent(n)}` : "";
  return (
    <Screen back="/login" title="휴대폰 번호로 가입하기">
      <div className="mt-4">
        <PageTitle title="휴대폰 번호로" accent="시작해요" sub="기본 정보만 입력하면 시작할 수 있어요." />
      </div>
      <form action={signup} className="mt-8">
        {n && <input type="hidden" name="next" value={n} />}
        <div className="space-y-6">
          <Field label="이름" required>
            <input name="name" autoComplete="name" placeholder="이름" required minLength={2} className={inputCls} />
          </Field>
          <Field label="휴대폰 번호" required>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" required pattern="01[0-9][\-\s]?[0-9]{3,4}[\-\s]?[0-9]{4}" title="010-1234-5678처럼 적어 주세요" className={inputCls} />
          </Field>
          <div>
            <Field label="비밀번호" required>
              <PasswordInput name="password" autoComplete="new-password" placeholder="6자 이상" required minLength={6} className={inputCls} />
            </Field>
            <p className="mt-2 text-[13px] text-muted">6자 이상 입력해 주세요.</p>
          </div>
        </div>
        <div className="mt-4"><ErrorText msg={e} /></div>
        <div className="mt-6"><PrimaryButton type="submit" pendingText="가입하는 중">가입하기</PrimaryButton></div>
      </form>
      <p className="mt-7 text-center text-[15px] text-muted">
        이미 계정이 있나요?{" "}
        <Link href={`/login/phone${q}`} className="inline-flex h-11 items-center px-1 font-semibold text-accent">로그인</Link>
      </p>
    </Screen>
  );
}
