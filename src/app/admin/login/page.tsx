import Image from "next/image";
import Link from "next/link";
import { ErrorText, IMG, PasswordInput, PrimaryButton, Required, inputCls } from "@/components/ui";
import { login } from "../../login/actions";

/** D1 운영자 로그인 */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="grid min-h-dvh md:grid-cols-[1.3fr_1fr]">
      <div className="relative hidden overflow-hidden md:block">
        <Image src={IMG.startTable} alt="" fill priority sizes="60vw" className="object-cover" />
        <div className="absolute left-14 top-[18%]">
          <p className="text-[52px] font-bold tracking-[-0.03em] text-ink">우연한 식탁</p>
          <p className="mt-2 text-[19px] text-[#4c5368]">따뜻한 만남을 준비하는 공간</p>
        </div>
      </div>
      <div className="flex items-center bg-paper px-8">
        <div className="mx-auto w-full max-w-sm">
          <span className="inline-flex rounded-full bg-accent-soft px-3.5 py-1.5 text-[14px] font-semibold text-accent">운영자</span>
          <h1 className="mt-4 text-[34px] font-bold tracking-[-0.03em] text-ink">운영자 로그인</h1>
          <p className="mt-2 text-[16px] text-muted">오늘의 식탁을 확인해 주세요.</p>
          <form action={login} className="mt-9 space-y-5">
            <input type="hidden" name="next" value="/admin" />
            <label className="block">
              <span className="text-[15px] font-bold text-ink">아이디<Required /></span>
              <input name="login_id" autoComplete="username" className={`${inputCls} mt-2 bg-card`} />
            </label>
            <label className="block">
              <span className="text-[15px] font-bold text-ink">비밀번호<Required /></span>
              <div className="mt-2"><PasswordInput name="password" autoComplete="current-password" className={`${inputCls} bg-card`} /></div>
            </label>
            <ErrorText msg={e} />
            <PrimaryButton type="submit" pendingText="로그인하는 중">로그인</PrimaryButton>
          </form>
          <p className="mt-6 text-center text-[14px] text-muted">운영 권한이 있는 계정으로 로그인해 주세요.</p>
          <p className="mt-2 text-center text-[13px] text-muted">
            심사위원이라면 <Link href="/guide" className="font-semibold text-accent">심사 안내</Link>에서 바로 들어갈 수 있어요.
          </p>
        </div>
      </div>
    </div>
  );
}
