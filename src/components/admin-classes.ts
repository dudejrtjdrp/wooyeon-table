// 어드민 버튼·입력칸 모양. 다른 모듈을 불러오지 않아 클라이언트 컴포넌트에서도 쓸 수 있다
export const ctl = "h-11 rounded-xl border border-line bg-card px-3.5 text-[14px] text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10";
export const btn = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold transition active:scale-[.98]";
export const btnPrimary = `${btn} bg-accent text-white shadow-cta`;
export const btnInk = `${btn} bg-accent text-white shadow-cta`;
export const btnLight = `${btn} border border-accent/40 bg-card text-accent hover:bg-accent-soft/50`;
export const btnDanger = `${btn} bg-danger text-white`;
export const th = "bg-[#f4f7fc] px-4 py-3 text-left text-[13px] font-semibold text-muted first:rounded-l-xl last:rounded-r-xl";
export const td = "px-4 py-3";
