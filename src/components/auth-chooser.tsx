import Link from "next/link";
import { enabledProviders } from "@/lib/oauth";
import { RoundTable } from "./brand";
import { ErrorText } from "./ui";
import { PASSES, won } from "@/lib/constants";

const KakaoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#191919" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.1 1.62.1 5.52 0 10-3.54 10-7.87S17.52 3 12 3z" />
  </svg>
);
const NaverIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#fff" d="M16.27 12.84 7.38 0H0v24h7.73V11.16L16.62 24H24V0h-7.73z" />
  </svg>
);
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export function AuthChooser({ next = "/", error, notice, upcoming }: { next?: string; error?: string; notice?: string; upcoming?: string | null }) {
  const on = enabledProviders();
  const q = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const social = on.kakao || on.naver || on.google;
  const btn = "flex h-[56px] w-full items-center justify-center gap-2 rounded-[14px] text-[16px] font-extrabold transition active:scale-[.985]";
  return (
    <main className="pb-safe mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      {/* E01: 초록 색면 위 "우연히, 같은 테이블." + 원형 테이블 */}
      <section className="pt-safe relative overflow-hidden bg-navy text-white" style={{ minHeight: "min(62dvh, 548px)" }}>
        <div className="px-7 pt-14">
          <p className="text-[15px] font-extrabold opacity-80">우연한 식탁</p>
          <h1 className="animate-rise mt-4 text-[40px] font-black leading-[1.22]">
            우연히,
            <br />
            같은 테이블.
          </h1>
          <p className="animate-rise mt-4 text-[16px] leading-relaxed text-on-accent" style={{ animationDelay: ".06s" }}>
            처음 보는 4~6명이 모여
            <br />
            저녁 한 끼를 같이 먹어요.
          </p>
          {/* 가입 전에 가장 많이 궁금한 것: 언제·얼마인지 (100명 시뮬레이션에서 첫 화면 이탈 이유 1위) */}
          <p className="animate-rise mt-3 text-[15px] font-bold leading-relaxed text-white" style={{ animationDelay: ".1s" }}>
            {upcoming ? `다음 모임 ${upcoming}` : "저녁 모임"} · 1회 {won(PASSES.single.amount)}
            <span className="block text-[13px] font-medium text-on-accent">식사비는 현장에서 각자 계산해요</span>
          </p>
          <ul className="relative z-10 mt-5 flex flex-wrap gap-1.5 text-[13px] font-bold text-[#ddf0e5]">
            {["나이 차 8살 안", "성비 맞춰서", "자동 확정"].map((t) => (
              <li key={t} className="flex h-7 items-center rounded-[14px] bg-accent2 px-2.5">{t}</li>
            ))}
          </ul>
        </div>
        <div className="pointer-events-none absolute -bottom-[150px] -right-[60px]">
          <RoundTable size={300} filled={5} tone="dark" me={false} />
        </div>
      </section>

      <div className="flex flex-1 flex-col gap-2.5 px-6 pb-6 pt-6">
        {notice && <p className="rounded-[12px] bg-accent-soft px-4 py-3 text-center text-[14px] font-bold text-accent-text">{notice}</p>}
        <ErrorText msg={error} />
        {on.kakao && (
          <a href={`/api/auth/kakao${q}`} className={`${btn} bg-[#FEE500] text-[#191919]`}>
            <KakaoIcon />카카오로 계속하기
          </a>
        )}
        {on.naver && (
          <a href={`/api/auth/naver${q}`} className={`${btn} bg-[#03C75A] text-white`}>
            <NaverIcon />네이버로 계속하기
          </a>
        )}
        {on.google && (
          <a href={`/api/auth/google${q}`} className={`${btn} bg-field text-ink`}>
            <GoogleIcon />구글로 계속하기
          </a>
        )}
        {/* 소셜 로그인이 하나도 안 열려 있으면 휴대폰 번호가 주 버튼이 된다. 누를 수 없는 버튼은 보여 주지 않는다 */}
        <Link href={`/signup${q}`} className={`${btn} ${social ? "bg-field text-ink" : "bg-accent text-white"}`}>
          휴대폰 번호로 시작하기
        </Link>
        <p className="flex items-center justify-center text-[15px] text-muted">
          이미 가입했어요
          <Link href={`/login/phone${q}`} className="flex h-11 items-center px-2 font-bold text-accent">로그인</Link>
        </p>
        {!social && <p className="text-center text-[13px] text-muted">카카오·네이버 로그인은 준비 중이에요.</p>}
        <Link href="/rounds" className="mx-auto flex h-11 items-center px-3 text-[14px] text-ink2 underline underline-offset-4">가입 전에 일정 둘러보기</Link>

        <div className="mt-auto pt-4 text-center text-[12px] leading-relaxed text-muted">
          <p>계속하면 이용약관과 개인정보 처리방침에 동의하게 돼요.</p>
          <nav aria-label="약관과 안내" className="flex items-center justify-center">
            <Link href="/terms" className="flex h-11 items-center px-2.5 underline underline-offset-2">이용약관</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="flex h-11 items-center px-2.5 underline underline-offset-2">개인정보 처리방침</Link>
            <span aria-hidden="true">·</span>
            <Link href="/guide" className="flex h-11 items-center px-2.5 underline underline-offset-2">심사위원 안내</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
