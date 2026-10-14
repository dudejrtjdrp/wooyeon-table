import Image from "next/image";
import Link from "next/link";
import { Backdrop, ErrorText, IMG, PasswordInput, PrimaryButton, Required, Screen } from "@/components/ui";
import { login } from "../actions";

/** A3 휴대폰 번호로 로그인 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  return (
    <Screen back="/login" title="휴대폰 번호로 로그인" backdrop={<Backdrop height={520} position="right top" />}>
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="relative size-24">
          <Image src={IMG.tableObject} alt="" fill sizes="96px" className="object-contain" priority />
        </div>
        <p className="mt-2 text-[17px] font-semibold text-ink">우연한 식탁</p>
        <h2 className="animate-rise mt-7 text-[30px] font-bold tracking-[-0.03em] text-ink">
          다시 만나서 <span className="text-accent">반가워요</span>
        </h2>
        <p className="mt-2 text-[16px] text-muted">따뜻한 저녁을 이어가 볼까요?</p>
      </div>
      <form action={login} className="mt-9 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="shadow-card block rounded-[20px] bg-card px-5 pb-3 pt-4">
          <span className="text-[13px] font-semibold text-muted">휴대폰 번호<Required /></span>
          <input name="login_id" inputMode="tel" autoComplete="username" placeholder="010-1234-5678" className="mt-1 h-10 w-full bg-transparent text-[18px] text-ink outline-none placeholder:text-muted/50" />
        </label>
        <label className="shadow-card block rounded-[20px] bg-card px-5 pb-3 pt-4">
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
