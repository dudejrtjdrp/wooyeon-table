import Link from "next/link";

export default function Guide() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-sm font-medium text-accent">심사위원 안내</p>
      <h1 className="mt-2 text-2xl font-bold">이 순서로 둘러보시면 돼요</h1>
      <p className="mt-3 text-muted">
        개발 중이라 내용이 계속 채워지고 있어요. 제출 전에 테스트 계정과 시연 순서를 여기에 정리해 둘게요.
      </p>
      <ul className="mt-8 space-y-3">
        <li>
          <Link className="underline underline-offset-4" href="/">참가자 앱</Link>
          <span className="text-muted"> — 휴대폰 화면으로 열어 주세요</span>
        </li>
        <li>
          <Link className="underline underline-offset-4" href="/admin">운영자 어드민</Link>
          <span className="text-muted"> — 데스크톱 화면 기준이에요</span>
        </li>
      </ul>
    </main>
  );
}
