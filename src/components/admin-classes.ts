// 어드민 버튼·입력칸 모양. 다른 모듈을 불러오지 않아 클라이언트 컴포넌트에서도 쓸 수 있다
export const ctl = "h-11 rounded-xl border border-line bg-card px-3.5 text-[14px] text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10";
export const btn = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold transition active:scale-[.98]";
export const btnPrimary = `${btn} bg-accent text-white shadow-cta`;
export const btnInk = `${btn} bg-accent text-white shadow-cta`;
export const btnLight = `${btn} border border-accent/40 bg-card text-accent hover:bg-accent-soft/50`;
export const btnDanger = `${btn} bg-danger text-white`;
// 표 공통 규칙 (docs/05-admin-tables.md): 표는 TableScroll(가로 스크롤 상자) 안에 두고, 머리·배지·숫자·시각은 줄을 바꾸지 않는다
export const table = "w-full text-[14px]";
export const th = "whitespace-nowrap bg-[#f4f7fc] px-4 py-3 text-left text-[13px] font-semibold text-muted first:rounded-l-xl last:rounded-r-xl";
export const td = "px-4 py-3";
/** 이름·시각·금액·배지처럼 한 줄로 보여야 하는 칸 */
export const tdNowrap = `${td} whitespace-nowrap`;
/** 주소·사유·바뀐 내용처럼 긴 글: 칸 폭을 지키고 낱말 단위로만 줄을 바꾼다 */
export const tdText = `${td} min-w-[200px] max-w-[320px] break-keep [overflow-wrap:break-word]`;
