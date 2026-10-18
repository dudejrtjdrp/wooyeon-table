// 우연한 식탁의 브랜드 장치: 위에서 내려다본 원형 테이블.
// 대기 = 나 + 빈 점선 좌석, 확정 = 좌석이 다 참, 실패 = 몇 자리만 참.

const SEAT_FILLS = ["var(--candle)", "var(--seat)"];

/**
 * 원형 테이블 그림.
 * - me: 맨 위 자리를 '나'로 칠한다
 * - filled: 채운 좌석 수(나 포함). 나머지는 점선 빈 자리
 * - center: 테이블 가운데 글자(결과 발표 시각 등)
 */
export function RoundTable({
  size = 220,
  seats = 6,
  filled = 1,
  me = true,
  center,
  tone = "light",
  label,
}: {
  size?: number;
  seats?: number;
  filled?: number;
  me?: boolean;
  center?: React.ReactNode;
  /** light: 흰 바탕 위, dark: 초록 색면 위 */
  tone?: "light" | "dark";
  label?: string;
}) {
  const seat = Math.round(size * 0.164);
  const table = Math.round(size * 0.5);
  const orbit = (size - seat) / 2;
  const c = size / 2;
  const dark = tone === "dark";
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div
        className="absolute flex items-center justify-center rounded-full text-center"
        style={{
          left: c - table / 2,
          top: c - table / 2,
          width: table,
          height: table,
          background: dark ? "var(--accent2)" : "var(--accent-soft)",
        }}
      >
        {center && <div className="text-[13px] font-extrabold leading-[1.45] text-accent-text">{center}</div>}
      </div>
      {Array.from({ length: seats }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats;
        const x = c + orbit * Math.cos(a) - seat / 2;
        const y = c + orbit * Math.sin(a) - seat / 2;
        const isMe = me && i === 0;
        const on = i < filled;
        const fill = isMe ? (dark ? "#ffffff" : "var(--accent)") : on ? (dark ? "#ffffff" : SEAT_FILLS[i % 2]) : undefined;
        return (
          <span
            key={i}
            className="absolute flex items-center justify-center rounded-full font-extrabold text-white"
            style={{
              left: x,
              top: y,
              width: seat,
              height: seat,
              background: fill,
              border: fill ? undefined : `2px dashed ${dark ? "var(--seat)" : "#d9cdbe"}`,
              fontSize: Math.max(10, seat * 0.36),
              color: isMe && dark ? "var(--accent)" : "#fff",
            }}
          >
            {isMe && seat >= 24 ? "나" : null}
          </span>
        );
      })}
    </div>
  );
}

/** 작은 로고 마크 */
export function TableMark({ size = 26, tone = "accent" }: { size?: number; tone?: "accent" | "white" | "ink"; seats?: number; filled?: number; glow?: boolean }) {
  const c = size / 2;
  const R = size * 0.25;
  const r = size * 0.4;
  const s = size * 0.09;
  const main = tone === "white" ? "#ffffff" : tone === "ink" ? "var(--ink)" : "var(--accent)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={R} fill={main} />
      {Array.from({ length: 6 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        return <circle key={i} cx={c + r * Math.cos(a)} cy={c + r * Math.sin(a)} r={s} fill={i === 0 ? "var(--candle)" : main} />;
      })}
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`text-[17px] font-black tracking-[-0.03em] text-accent ${className}`}>우연한 식탁</span>;
}
