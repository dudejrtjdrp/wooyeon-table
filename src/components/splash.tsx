// 앱을 켰을 때 나오는 첫 장면 (약 2초, 누르거나 키를 치면 바로 닫힘). 하루에 한 번만.
// '우연'의 두 ㅇ이 리본 한 줄로 이어 그려지고, 나머지 획과 '한(작게) 식탁'이 차례로 붙은 뒤 사라진다.
// 같은 날 다시 켜면(PWA 재실행 포함) 건너뛴다. 어드민·심사 안내·알림으로 연 화면에서는 나오지 않는다.

import { Wordmark } from "./logo";

export function Splash() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=location.pathname;if(/^\\/(admin|guide|api|verify|offline)/.test(p)||/[?&]from=push/.test(location.search)||localStorage.getItem('wt_splash')===new Date().toDateString()){document.documentElement.dataset.splash='off'}else{localStorage.setItem('wt_splash',new Date().toDateString())}}catch(e){}`,
        }}
      />
      <div id="splash" aria-hidden="true" className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-paper px-10 text-ink">
        <Wordmark animate className="w-full max-w-[300px]" />
        <p className="splash-tag mt-6 text-[14px] font-medium text-muted">처음 만나는 사람들과 저녁 한 끼</p>
      </div>
      {/* 기다리기 싫으면 아무 데나 누르거나 키를 쳐서 바로 닫는다. 손을 뗄 때 닫고, 그 손짓이 아래 버튼까지 눌리지 않게 클릭 한 번을 막는다 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var s=document.getElementById('splash');if(s){var c=function(){if(s.style.display==='none')return;s.style.display='none';document.removeEventListener('keydown',c)};s.addEventListener('pointerup',function(e){e.preventDefault();c()});s.addEventListener('click',function(e){e.preventDefault();e.stopPropagation()},true);document.addEventListener('keydown',c)}}catch(e){}`,
        }}
      />
    </>
  );
}
