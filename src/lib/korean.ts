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
