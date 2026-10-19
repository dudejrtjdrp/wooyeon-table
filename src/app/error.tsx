"use client";

import Link from "next/link";

// 화면을 그리다 문제가 생겼을 때. 다시 시도와 홈으로 (내부 오류 내용은 보여 주지 않는다)
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="text-[22px] font-bold text-ink">잠깐 문제가 생겼어요</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink2">잠시 뒤 다시 시도해 주세요. 계속 안 되면 내 정보의 문의하기로 알려 주세요.</p>
      <button onClick={() => reset()} className="mt-8 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-extrabold text-white active:scale-[.985]">다시 시도</button>
      <Link href="/" className="mt-2 inline-flex h-11 items-center text-[14px] font-semibold text-accent">홈으로</Link>
    </main>
  );
}
