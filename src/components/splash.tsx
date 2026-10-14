// 앱을 켰을 때 한 번 나오는 첫 장면 (약 1.9초).
// 식탁 테두리가 그려지고 → 자리 여섯 개가 하나씩 채워지고 → 조명이 켜지며 이름이 떠오른 뒤 사라진다.
// 서버에서 바로 그려 깜빡임이 없고, 같은 창에서는 한 번만 나온다. 어드민·심사 안내에서는 나오지 않는다.

const SEATS = 6;

export function Splash() {
  const c = 90;
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=location.pathname;if(/^\\/(admin|guide|api|verify|offline)/.test(p)||sessionStorage.getItem('wt_splash')){document.documentElement.dataset.splash='off'}else{sessionStorage.setItem('wt_splash','1')}}catch(e){}`,
        }}
      />
      <div id="splash" aria-hidden="true" className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-accent">
        <svg width={180} height={180} viewBox="0 0 180 180">
          <defs>
            <radialGradient id="lamp">
              <stop offset="0" stopColor="#ffd27a" stopOpacity="1" />
              <stop offset=".35" stopColor="#ffb938" stopOpacity=".75" />
              <stop offset="1" stopColor="#ffb938" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle className="splash-glow" cx={c} cy={c} r={40} fill="url(#lamp)" />
          <circle className="splash-glow" cx={c} cy={c} r={7} fill="#fff4d6" />
          <circle className="splash-ring" cx={c} cy={c} r={44} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" pathLength={1} />
          {Array.from({ length: SEATS }, (_, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / SEATS;
            return (
              <circle
                key={i}
                className="splash-seat"
                style={{ animationDelay: `${0.38 + i * 0.1}s` }}
                cx={c + 73 * Math.cos(a)}
                cy={c + 73 * Math.sin(a)}
                r={12}
                fill="#fff"
              />
            );
          })}
        </svg>
        <p className="splash-name mt-7 text-[24px] font-bold tracking-[-0.03em] text-white">우연한 식탁</p>
      </div>
    </>
  );
}
