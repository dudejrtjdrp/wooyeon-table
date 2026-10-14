// 앱을 켰을 때 한 번 나오는 첫 장면 (약 1.9초, 시안 A1).
// 남색 바탕에 식탁 사진이 떠오르고 → 자리마다 불이 켜지듯 밝아지고 → 가운데 조명이 켜지며 이름이 떠오른 뒤 사라진다.
// 서버에서 바로 그려 깜빡임이 없고, 같은 창에서는 한 번만 나온다. 어드민·심사 안내에서는 나오지 않는다.
import Image from "next/image";

export function Splash() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=location.pathname;if(/^\\/(admin|guide|api|verify|offline)/.test(p)||sessionStorage.getItem('wt_splash')){document.documentElement.dataset.splash='off'}else{sessionStorage.setItem('wt_splash','1')}}catch(e){}`,
        }}
      />
      <div id="splash" aria-hidden="true" className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-navy">
        <div className="splash-photo relative size-[min(92vw,420px)]">
          <Image src="/images/dining/extracted/original-splash-table.png" alt="" fill sizes="420px" priority className="object-cover" />
          <span className="splash-lamp absolute left-1/2 top-1/2 size-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </div>
        <p className="splash-name mt-10 text-[34px] font-bold tracking-[-0.03em] text-white">우연한 식탁</p>
        <p className="splash-name mt-2 text-[15px] text-white/75" style={{ animationDelay: "1.15s" }}>낯선 만남이 따뜻한 저녁으로</p>
      </div>
    </>
  );
}
