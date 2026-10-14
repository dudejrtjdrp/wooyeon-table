// 우연한 식탁의 상징: 위에서 내려다본 둥근 식탁과 둘레의 자리.
// 로고로도 쓰고, 테이블이 얼마나 찼는지 보여줄 때도 같은 모양을 쓴다.

export function TableMark({
  size = 40,
  seats = 6,
  filled = seats,
  tone = "accent",
  glow = false,
}: {
  size?: number;
  seats?: number;
  filled?: number;
  tone?: "accent" | "white" | "ink";
  glow?: boolean;
}) {
  const c = size / 2;
  const R = size * 0.25; // 식탁
  const r = size * 0.42; // 자리 궤도
  const s = size * 0.075; // 자리 크기
  const main = tone === "white" ? "#ffffff" : tone === "ink" ? "var(--ink)" : "var(--accent)";
  const empty = tone === "white" ? "rgba(255,255,255,.35)" : "var(--line)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {glow && (
        <>
          <defs>
            <radialGradient id={`lamp-${size}`}>
              <stop offset="0" stopColor="#ffd27a" />
              <stop offset=".4" stopColor="#ffb938" stopOpacity=".7" />
              <stop offset="1" stopColor="#ffb938" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={c} cy={c} r={R * 0.95} fill={`url(#lamp-${size})`} />
          <circle cx={c} cy={c} r={R * 0.18} fill="#fff4d6" />
        </>
      )}
      <circle cx={c} cy={c} r={R} fill="none" stroke={main} strokeWidth={size * 0.05} />
      {Array.from({ length: seats }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats;
        return <circle key={i} cx={c + r * Math.cos(a)} cy={c + r * Math.sin(a)} r={s} fill={i < filled ? main : empty} />;
      })}
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-[-0.02em] ${className}`}>
      <TableMark size={26} />
      우연한 식탁
    </span>
  );
}
