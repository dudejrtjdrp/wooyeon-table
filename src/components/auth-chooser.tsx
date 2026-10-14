import Link from "next/link";
import { enabledProviders } from "@/lib/oauth";
import { ErrorText } from "./ui";

/** 첫 화면의 식탁: 자리가 하나씩 채워지고 마지막에 조명이 켜진다 */
function ArrivingTable() {
  const size = 168;
  const c = size / 2;
  const seats = 6;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <radialGradient id="lamp-hero">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset=".4" stopColor="#ffb938" stopOpacity=".7" />
          <stop offset="1" stopColor="#ffb938" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="glow-in" style={{ animationDelay: "1.5s" }} cx={c} cy={c} r={38} fill="url(#lamp-hero)" />
      <circle className="glow-in" style={{ animationDelay: "1.5s" }} cx={c} cy={c} r={6} fill="#fff4d6" />
      <circle cx={c} cy={c} r={42} fill="none" stroke="var(--accent)" strokeWidth={7} />
      {Array.from({ length: seats }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats;
        return (
          <circle
            key={i}
            className="seat-in"
            style={{ animationDelay: `${0.25 + i * 0.18}s` }}
            cx={c + 70 * Math.cos(a)}
            cy={c + 70 * Math.sin(a)}
            r={12}
            fill="var(--accent)"
          />
        );
      })}
    </svg>
  );
}

const KakaoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#191919" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.1 1.62.1 5.52 0 10-3.54 10-7.87S17.52 3 12 3z" />
  </svg>
);
const NaverIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#fff" d="M16.27 12.84 7.38 0H0v24h7.73V11.16L16.62 24H24V0h-7.73z" />
  </svg>
);
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export function AuthChooser({ next = "/", error, notice }: { next?: string; error?: string; notice?: string }) {
  const on = enabledProviders();
  const q = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const btn = "flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold transition active:scale-[.985]";
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col bg-paper px-6">
      <div className="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <ArrivingTable />
        <h1 className="mt-10 text-[28px] font-bold leading-[1.3] tracking-[-0.03em]">
          처음 만나는 네다섯 명과
          <br />
          저녁 한 끼
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">날짜와 동네만 고르면 테이블은 저희가 꾸려요.</p>
      </div>

      <div className="space-y-3 pb-6 pt-8">
        {notice && <p className="rounded-2xl bg-leaf/10 px-4 py-3 text-center text-[14px] font-medium text-leaf">{notice}</p>}
        <ErrorText msg={error} />
        <a href={`/api/auth/kakao${q}`} className={`${btn} bg-[#FEE500] text-[#191919]`}>
          <KakaoIcon />
          카카오로 시작하기
        </a>
        <a href={`/api/auth/naver${q}`} className={`${btn} bg-[#03C75A] text-white`}>
          <NaverIcon />
          네이버로 시작하기
        </a>
        <a href={`/api/auth/google${q}`} className={`${btn} border border-line bg-card text-[#3C4043]`}>
          <GoogleIcon />
          Google로 시작하기
        </a>
        {!(on.kakao || on.naver || on.google) && (
          <p className="text-center text-[12px] text-muted">소셜 로그인은 곧 열려요. 지금은 휴대폰 번호로 이용할 수 있어요.</p>
        )}
        <div className="flex items-center justify-center gap-4 pt-2 text-[14px] text-muted">
          <Link href={`/login/phone${q}`} className="font-medium">휴대폰 번호로 로그인</Link>
          <span className="h-3 w-px bg-line" />
          <Link href="/guide" className="font-medium">심사위원 안내</Link>
        </div>
        <p className="pt-2 text-center text-[12px] leading-relaxed text-muted">
          시작하면 <Link href="/terms" className="underline underline-offset-2">이용약관</Link>과{" "}
          <Link href="/privacy" className="underline underline-offset-2">개인정보 처리방침</Link>에 동의하는 것으로 봐요.
        </p>
      </div>
    </main>
  );
}
