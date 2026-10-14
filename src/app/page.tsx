import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-14">
      <p className="text-sm font-medium text-accent">우연한 식탁</p>
      <h1 className="mt-3 text-[28px] font-bold leading-snug tracking-tight">
        처음 만나는 네다섯 명과
        <br />
        저녁 한 끼 어때요?
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        날짜와 동네만 고르면 결이 맞는 사람들로 테이블을 꾸려 드려요. 식당 예약과 단체방까지
        알아서 준비돼요.
      </p>

      <div className="mt-10 rounded-2xl border border-line bg-card p-5">
        <p className="text-sm text-muted">지금 준비 중이에요</p>
        <p className="mt-1 text-[15px]">곧 여기서 신청하고 매칭 상태를 확인할 수 있어요.</p>
      </div>

      <div className="mt-auto pt-10 text-center text-sm text-muted">
        <Link href="/guide" className="underline underline-offset-4">
          심사위원 안내 보기
        </Link>
      </div>
    </main>
  );
}
