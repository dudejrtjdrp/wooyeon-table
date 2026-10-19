// 받침 판단과 조사. 한글은 글자 그대로, 영문·숫자는 읽는 소리로 본다 (B5FA → '에이' 받침 없음, 1 → '일' 받침 있음)
const LETTER_BATCHIM = new Set(["L", "M", "N", "R"]); // 엘·엠·엔·알
const DIGIT_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]); // 영·일·삼·육·칠·팔

/** 받침이 있으면 true. 한글·영문·숫자가 아니면 false */
export function hasBatchim(word: string): boolean {
  const ch = word.trim().replace(/['"’”)\]]+$/, "").slice(-1);
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (/[a-z]/i.test(ch)) return LETTER_BATCHIM.has(ch.toUpperCase());
  if (/\d/.test(ch)) return DIGIT_BATCHIM.has(ch);
  return false;
}

/** 서연 → 서연이에요, 지우 → 지우예요, B5FA → B5FA예요 */
export const iyeyo = (word: string) => `${word}${hasBatchim(word) ? "이에요" : "예요"}`;

const lastSound = (word: string) => word.trim().replace(/['"’”)\]]+$/, "").slice(-1);
/** 받침이 ㄹ이면 true ('으로/로'에서 ㄹ 받침은 '로') */
function rieul(word: string): boolean {
  const ch = lastSound(word);
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 === 8;
  if (/[a-z]/i.test(ch)) return ch.toUpperCase() === "L";
  return ["1", "7", "8"].includes(ch);
}
/** 다른 일정 → 다른 일정으로, 홍대·합정·연남 → …연남으로, 서울 → 서울로 */
export const euro = (word: string) => `${word}${hasBatchim(word) && !rieul(word) ? "으로" : "로"}`;
/** 홍대·합정·연남 → …연남은, 잠실·송파 → …송파는 */
export const eunNeun = (word: string) => `${word}${hasBatchim(word) ? "은" : "는"}`;
