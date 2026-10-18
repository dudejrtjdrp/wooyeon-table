// 우연한 식탁 글자 로고. 폰트 없이 선으로 직접 그린 글자라 스플래시·아이콘·헤더에서 모양이 같다.
// '우연'의 두 ㅇ은 끊기지 않는 리본 한 줄로 이어진다: 모르는 두 사람이 한 줄로 묶인다는 뜻.
// 글자 칸은 120×120, 선 굵기 13. '한'은 작게(0.68배) 아래에 붙인다.

/** 두 ㅇ을 잇는 리본: 우의 ㅇ을 한 바퀴 돌고, 작은 고리를 한 번 감은 뒤 연의 ㅇ을 한 바퀴 돈다 */
export const RIBBON =
  "M86 38 A26 26 0 1 1 34 38 A26 26 0 1 1 86 38 C116 38 140 -10 118 -14 C96 -18 100 50 151 44 A26 26 0 1 1 203 44 A26 26 0 1 1 151 44";

/** 리본을 뺀 나머지 획. [그리는 순서대로] */
export const STROKES_WOOYEON = [
  "M12 84 H108", "M60 84 V118", // 우의 ㅜ
  "M232 8 V86", "M206 32 H232", "M206 58 H232", // 연의 ㅕ
  "M165 94 V118 H250", // 연의 ㄴ
];
/** '한' (작게, 원점 기준. 0.68배로 줄여 쓴다) */
export const STROKES_HAN = ["M32 8 H52", "M14 26 H70", "M92 4 V82", "M92 43 H114", "M24 90 V116 H108"];
export const HAN_CIRCLE = { cx: 42, cy: 54, r: 16 };
/** '식' '탁' (글자 칸 원점 기준) */
export const STROKES_SIK = ["M44 8 L12 74", "M38 32 L76 74", "M98 4 V86", "M18 98 H98 V122"];
export const STROKES_TAK = ["M72 10 H18 V72 H74", "M18 41 H66", "M98 4 V86", "M98 45 H116", "M18 98 H100 V122"];

const W = 13;

/** 글자 로고 전체(우연한 식탁). animate면 스플래시처럼 리본부터 그려진다 */
export function Wordmark({ animate = false, className, title = "우연한 식탁" }: { animate?: boolean; className?: string; title?: string }) {
  const d = (s: number) => (animate ? { style: { animationDelay: `${s}s` } } : {});
  const line = (path: string, i: number, base: number, step = 0.06) => (
    <path key={path} d={path} pathLength={1} className={animate ? "wm-draw" : undefined} {...d(base + i * step)} />
  );
  return (
    <svg viewBox="-8 -24 638 156" className={className} role="img" aria-label={title} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={W}>
      <path d={RIBBON} pathLength={1} stroke="var(--accent)" className={animate ? "wm-ribbon" : undefined} />
      <g stroke="currentColor">
        {STROKES_WOOYEON.map((p, i) => line(p, i, 0.6, 0.05))}
        {/* 위치(transform 속성)와 움직임(CSS)을 다른 g에 둔다: 한 g에 같이 두면 CSS 기준점이 위치까지 옮긴다 */}
        <g transform="translate(262 40) scale(.68)" strokeWidth={(W - 2) / 0.68}>
          <g className={animate ? "wm-pop" : undefined} {...d(0.88)}>
            {STROKES_HAN.map((p) => <path key={p} d={p} />)}
            <circle {...HAN_CIRCLE} />
          </g>
        </g>
        <g transform="translate(374 0)">
          <g className={animate ? "wm-rise" : undefined} {...d(0.95)}>{STROKES_SIK.map((p) => <path key={p} d={p} />)}</g>
        </g>
        <g transform="translate(502 0)">
          <g className={animate ? "wm-rise" : undefined} {...d(1.01)}>{STROKES_TAK.map((p) => <path key={p} d={p} />)}</g>
        </g>
      </g>
    </svg>
  );
}

/** 아이콘용 마크: 리본으로 이어진 ㅇㅇ만 */
export function RibbonMark({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="2 -30 234 108" className={className} aria-hidden="true" fill="none" stroke={color} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round">
      <path d={RIBBON} />
    </svg>
  );
}
