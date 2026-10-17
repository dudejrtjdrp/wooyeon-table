/**
 * 로그인·가입 아이디 정리. 번호 모양(010 1234 5678, 010.1234.5678, +82 10-…, +82 010-…)이면 010으로 시작하는 숫자만 남기고,
 * admin·test-… 같은 아이디는 앞뒤 공백만 뺀다 (번호 칸은 띄어쓰기를 받아 주는데 서버가 거절해 입력이 다 지워지던 문제, 2026-10-18)
 */
export function normalizeLoginId(s: string): string {
  const v = s.trim();
  if (!/^\+?[\d\s.\-()]+$/.test(v)) return v;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("82") && d.length >= 11) d = `0${d.slice(2)}`;
  return d.replace(/^00+/, "0");
}
