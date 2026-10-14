import Image from "next/image";
import Link from "next/link";
import { Backdrop, ErrorText, Field, IMG, PasswordInput, PageTitle, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { signup } from "../login/actions";

/** A3-signup 휴대폰 번호로 가입하기 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <Screen back="/login" title="휴대폰 번호로 가입하기" backdrop={<Backdrop height={460} />}>
      <div className="relative mt-6 min-h-[150px]">
        <div className="pointer-events-none absolute -right-8 -top-10 size-[210px]">
          <Image src={IMG.startTable} alt="" fill sizes="210px" priority className="rounded-full object-cover" style={{ maskImage: "radial-gradient(closest-side, #000 68%, transparent)", WebkitMaskImage: "radial-gradient(closest-side, #000 68%, transparent)" }} />
        </div>
        <PageTitle title="첫 식탁을" accent="함께 준비해요" sub="기본 정보만 입력하면 시작할 수 있어요." />
      </div>
      <form action={signup} className="mt-8">
        <div className="shadow-card space-y-6 rounded-[22px] bg-card p-5">
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
