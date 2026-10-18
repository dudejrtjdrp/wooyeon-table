// 앱을 켰을 때 한 번 나오는 첫 장면 (약 1.9초, 누르면 바로 닫힘).
// '우연'의 두 ㅇ이 리본 한 줄로 이어 그려지고, 나머지 획과 '한(작게) 식탁'이 차례로 붙은 뒤 사라진다.
// 같은 창에서는 한 번만 나온다. 어드민·심사 안내·알림으로 연 화면에서는 나오지 않는다.

import { Wordmark } from "./logo";

export function Splash() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=location.pathname;if(/^\\/(admin|guide|api|verify|offline)/.test(p)||/[?&]from=push/.test(location.search)||sessionStorage.getItem('wt_splash')){document.documentElement.dataset.splash='off'}else{sessionStorage.setItem('wt_splash','1')}}catch(e){}`,
        }}
      />
      <div id="splash" aria-hidden="true" className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-paper px-10 text-ink">
        <Wordmark animate className="w-full max-w-[300px]" />
        <p className="splash-tag mt-6 text-[14px] font-medium text-muted">처음 만나는 사람들과 저녁 한 끼</p>
      </div>
      {/* 기다리기 싫으면 아무 데나 눌러 바로 닫는다 */}
      <script dangerouslySetInnerHTML={{ __html: `try{var s=document.getElementById('splash');s&&s.addEventListener('pointerdown',function(){s.style.display='none'})}catch(e){}` }} />
    </>
  );
}
