// 앱을 켰을 때 한 번 나오는 첫 장면 (약 1.4초).
// 초록 색면 위에 원형 테이블 자리가 하나씩 차고 이름이 떠오른 뒤 사라진다.
// 같은 창에서는 한 번만 나온다. 어드민·심사 안내에서는 나오지 않는다.

export function Splash() {
  const seats = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return { x: 80 + 62 * Math.cos(a), y: 80 + 62 * Math.sin(a), d: 0.15 + i * 0.12 };
  });
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=location.pathname;if(/^\\/(admin|guide|api|verify|offline)/.test(p)||sessionStorage.getItem('wt_splash')){document.documentElement.dataset.splash='off'}else{sessionStorage.setItem('wt_splash','1')}}catch(e){}`,
        }}
      />
      <div id="splash" aria-hidden="true" className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-navy">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="40" fill="var(--accent2)" />
          {seats.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r="14" fill={i === 0 ? "var(--candle)" : "#ffffff"} className="seat-in" style={{ animationDelay: `${s.d}s` }} />
          ))}
        </svg>
        <p className="splash-name mt-8 text-[30px] font-black tracking-[-0.03em] text-white">우연한 식탁</p>
      </div>
    </>
  );
}
