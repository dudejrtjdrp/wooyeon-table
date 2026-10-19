import { TableMark } from "@/components/brand";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <TableMark size={64} filled={0} />
      <h1 className="mt-6 text-[22px] font-bold tracking-[-0.02em]">인터넷 연결이 끊겼어요</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">연결되면 바로 이어서 볼 수 있어요. 받은 알림은 홈 위쪽 알림에 그대로 남아 있어요.</p>
      {/* 오프라인에서는 전체 새로고침으로 다시 시도해야 해서 a를 쓴다 */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-8 flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-white">다시 시도하기</a>
    </main>
  );
}
