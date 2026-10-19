import Link from "next/link";
import { RoundTable } from "@/components/brand";

// 없는 주소. 왜 여기 왔는지 한 줄, 갈 곳 하나
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center bg-paper px-6 text-center">
      <RoundTable size={120} filled={0} me={false} />
      <h1 className="mt-8 text-[22px] font-bold text-ink">찾는 화면이 없어요</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink2">주소가 바뀌었거나 지난 모임일 수 있어요.</p>
      <Link href="/" className="mt-8 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-extrabold text-white active:scale-[.985]">홈으로</Link>
      <Link href="/rounds" className="mt-2 inline-flex h-11 items-center text-[14px] font-semibold text-accent">모집 중인 일정 보기</Link>
    </main>
  );
}
