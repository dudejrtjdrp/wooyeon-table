// 봇 계정 구분 (DB 없이 쓰는 순수 함수). 화면(신청자·테이블)과 bots.ts가 같이 쓴다
// 봇 = is_demo이면서 login_id가 'test-'로 시작하는 계정. 시연 참가자 계정(010…)은 is_demo여도 사람으로 본다
export const isBot = (u: { login_id?: string | null; is_demo?: boolean | null } | null | undefined) => Boolean(u?.is_demo) && (u?.login_id ?? "").startsWith("test-");
