import Link from "next/link";
import { ErrorText, Field, PrimaryButton, inputCls } from "@/components/ui";
import { login } from "../../login/actions";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-6 py-20">
      <p className="text-sm font-medium text-accent">우연한 식탁 운영</p>
      <h1 className="mt-2 text-2xl font-bold">운영자 로그인</h1>
      <form action={login} className="mt-8 space-y-4">
        <input type="hidden" name="next" value="/admin" />
        <Field label="아이디"><input name="login_id" className={inputCls} /></Field>
        <Field label="비밀번호"><input name="password" type="password" className={inputCls} /></Field>
        <ErrorText msg={e} />
        <PrimaryButton type="submit">로그인</PrimaryButton>
      </form>
      <p className="mt-6 text-[13px] text-muted">
        심사위원이라면 <Link href="/guide" className="underline underline-offset-4">심사 안내</Link>에서 바로 들어갈 수 있어요.
      </p>
    </div>
  );
}
