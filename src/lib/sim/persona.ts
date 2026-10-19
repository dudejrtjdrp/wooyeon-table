// 시연용 봇의 성격. 실제 운영과 상관없고, 심사 시연에서 테이블을 사람처럼 보이게 하는 데만 쓴다 (docs/06-demo-bots.md)
// 같은 사람은 언제 계산해도 같은 성격이 나오도록 user id 해시와 프로필에서만 정한다.

export type Tone = "chatty" | "polite" | "brief";
export type Arrival = "early" | "onTime" | "late";

export type BotProfile = {
  job?: string | null;
  mbti?: string | null;
  interests?: string[] | null;
  my_traits?: string[] | null;
  gender?: string | null;
  birth_year?: number | null;
};

export type Persona = {
  userId: string;
  name: string;
  /** 성을 뺀 이름 (김서연 → 서연) */
  first: string;
  tone: Tone;
  /** 'ㅎㅎ'를 가끔 쓰는 편 */
  laugh: boolean;
  arrival: Arrival;
  interests: string[];
  job: string | null;
  /** 0~1. 높을수록 후기를 후하게 준다 */
  warmth: number;
  seed: number;
};

/** FNV-1a 32비트. 같은 문자열이면 늘 같은 수 */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0 이상 1 미만. seed와 key가 같으면 같은 값 */
export function rand(seed: number | string, key: string): number {
  return hash(`${seed}|${key}`) / 2 ** 32;
}

const CHATTY = ["유쾌한", "에너지 넘치는", "리액션 좋은", "호기심 많은"];
const CALM = ["차분한", "진지한"];

export function firstName(name: string): string {
  const n = name.trim();
  return n.length >= 3 ? n.slice(1) : n;
}

export function persona(user: { id: string; name: string }, profile: BotProfile | null): Persona {
  const seed = hash(user.id);
  const traits = profile?.my_traits ?? [];
  const ei = profile?.mbti?.[0];
  // 말 많은 정도: E면 올리고 I면 내린다. 성향 단어로 조금 더 민다
  let talk = ei === "E" ? 0.65 : ei === "I" ? 0.3 : 0.45;
  talk += traits.filter((t) => CHATTY.includes(t)).length * 0.12;
  talk -= traits.filter((t) => CALM.includes(t)).length * 0.12;
  talk += (rand(seed, "talk") - 0.5) * 0.3;
  const tone: Tone = talk >= 0.62 ? "chatty" : talk >= 0.35 ? "polite" : "brief";

  const laugh = tone === "chatty" ? rand(seed, "laugh") < 0.8 : traits.includes("유쾌한") || traits.includes("리액션 좋은") ? true : rand(seed, "laugh") < 0.3;

  const a = rand(seed, "arrival") - (traits.some((t) => CALM.includes(t)) ? 0.15 : 0);
  const arrival: Arrival = a < 0.3 ? "early" : a < 0.8 ? "onTime" : "late";

  let warmth = 0.55 + (rand(seed, "warmth") - 0.5) * 0.5;
  if (traits.includes("다정한") || traits.includes("리액션 좋은")) warmth += 0.15;
  if (traits.includes("솔직한") || traits.includes("진지한")) warmth -= 0.15;
  warmth = Math.max(0, Math.min(1, warmth));

  const interests = [...(profile?.interests ?? [])];
  // 먼저 꺼낼 관심사 순서도 사람마다 다르게
  interests.sort((x, y) => rand(seed, `i:${x}`) - rand(seed, `i:${y}`));

  return { userId: user.id, name: user.name, first: firstName(user.name), tone, laugh, arrival, interests, job: profile?.job ?? null, warmth, seed };
}

export { hasBatchim, iyeyo } from "../korean";
import { hasBatchim } from "../korean";

/** 이/가, 은/는, 을/를, 이랑/랑, 으로/로 */
export function josa(word: string, pair: "이가" | "은는" | "을를" | "이랑" | "으로"): string {
  const b = hasBatchim(word);
  const last = word.trim().slice(-1).charCodeAt(0);
  const rieul = last >= 0xac00 && (last - 0xac00) % 28 === 8;
  const map = { 이가: b ? "이" : "가", 은는: b ? "은" : "는", 을를: b ? "을" : "를", 이랑: b ? "이랑" : "랑", 으로: b && !rieul ? "으로" : "로" };
  return `${word}${map[pair]}`;
}

/** 모임 시작 기준 이 사람이 도착하는 시각(분). 일찍 오는 사람은 음수 */
export function arrivalMinutes(p: Persona): number {
  const r = rand(p.seed, "arrive-min");
  if (p.arrival === "early") return -15 + Math.round(r * 8); // 15~7분 전
  if (p.arrival === "onTime") return -5 + Math.round(r * 7); // 5분 전~2분 뒤
  return 6 + Math.round(r * 9); // 6~15분 늦게
}
