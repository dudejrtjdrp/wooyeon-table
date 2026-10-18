import { LOGOS, type LogoFont } from "./logo-data";

// 우연한 식탁 글자 로고. '우연'의 두 ㅇ은 끊기지 않는 리본 한 줄로 이어진다: 모르는 두 사람이 한 줄로 묶인다는 뜻.
// '한'은 작게. 글자는 글꼴 윤곽(logo-data.ts, 기본 고운바탕). 아이콘은 scripts/make-icons.mjs가 같은 리본으로 만든다.

/**
 * 글자 로고 전체(우연한 식탁). 글꼴 윤곽을 쓰고, 우·연의 ㅇ만 리본 선 하나로 다시 그린다(logo-data.ts).
 * animate면 왼쪽 ㅇ에서 시작한 선이 리본 고리를 지나 오른쪽 ㅇ까지 한 번에 그려진 뒤 나머지 글자가 붙는다.
 */
export function Wordmark({ animate = false, font = "batang", className, title = "우연한 식탁" }: { animate?: boolean; font?: LogoFont; className?: string; title?: string }) {
  const L = LOGOS[font];
  const d = (s: number) => (animate ? { style: { animationDelay: `${s}s` } } : {});
  return (
    <svg viewBox={L.vb} className={className} role="img" aria-label={title}>
      <g fill="currentColor">
        <path d={L.wy} className={animate ? "wm-rise" : undefined} {...d(1.0)} />
        {/* 다른 획과 붙어 있던 원래 ㅇ을 바탕색으로 덮는다(리본 원이 그 자리를 대신한다) */}
        {L.erase && <path d={L.erase} fill="none" stroke="var(--paper)" strokeWidth={L.eraseW} className={animate ? "wm-rise" : undefined} {...d(1.0)} />}
        <path d={L.han} className={animate ? "wm-pop" : undefined} {...d(1.08)} />
        <path d={L.sik} className={animate ? "wm-rise" : undefined} {...d(1.14)} />
      </g>
      {/* 리본은 글자 위에: '연'처럼 ㅇ이 다른 획과 붙은 글꼴은 리본이 그 ㅇ을 덮는다 */}
      <path d={L.ribbon} pathLength={1} fill="none" stroke="var(--ribbon)" strokeWidth={L.sw} strokeLinecap="round" strokeLinejoin="round" className={animate ? "wm-ribbon" : undefined} />
    </svg>
  );
}
