// 사람이 신청하면 같은 일정에 같이 신청할 봇을 고르거나 새로 만든다 (DB 없이 계산만)
import { INTERESTS, MBTIS, TRAITS } from "../constants";
import { rand } from "./persona";

export type JoinProfile = { birth_year: number; gender: "M" | "F"; interests: string[]; price_range: string | null };
export type Candidate = { userId: string; profile: JoinProfile };

/** 테이블 최소 인원. 사람 포함 이만큼은 되게 채운다 */
export const MIN_TABLE = 4;
export const MAX_TABLE = 6;
/** 같은 테이블로 묶일 만한 나이 차 (엔진 필수 조건 8살보다 좁게) */
export const AGE_NEAR = 3;

/**
 * 사람 포함 최소 인원이 되려면 봇이 몇 명 필요한지. 그 일정에 이미 기다리는 사람 중 나이가 가까운 사람을 세되,
 * 여러 일정을 고른 사람은 다른 일정으로 갈 수도 있어 1/고른 일정 수만큼만 센다
 */
export function botsNeeded(myBirth: number, others: { birth_year: number; slots: number }[]): number {
  const likely = others.filter((o) => Math.abs(o.birth_year - myBirth) <= AGE_NEAR).reduce((s, o) => s + 1 / Math.max(1, o.slots), 0);
  const need = Math.max(0, MIN_TABLE - 1 - Math.floor(likely + 1e-9));
  // 여러 일정을 고른 사람이 다 이 일정에 남아도 한 테이블(최대 6명)을 넘지 않게. 넘치면 사람이 테이블에서 빠질 수 있다
  return Math.min(need, Math.max(0, MAX_TABLE - 1 - others.length));
}

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;

/** 성비가 맞도록 다음에 넣을 성별 */
export function nextGender(have: ("M" | "F")[]): "M" | "F" {
  const m = have.filter((g) => g === "M").length;
  return m > have.length - m ? "F" : "M";
}

/**
 * 이미 있는 봇 가운데 need명을 고른다. 나이가 가깝고(±3), 관심사가 1~2개 겹치고, 성비가 맞는 순.
 * have: 이미 그 일정에 있는 사람들의 성별(사람 포함)
 */
export function chooseBots(user: JoinProfile, cands: Candidate[], need: number, have: ("M" | "F")[], seed: string): Candidate[] {
  const pool = cands.filter((c) => Math.abs(c.profile.birth_year - user.birth_year) <= AGE_NEAR);
  const out: Candidate[] = [];
  const genders = [...have];
  while (out.length < need) {
    const want = nextGender(genders);
    const rest = pool.filter((c) => !out.includes(c));
    if (!rest.length) break;
    const score = (c: Candidate) => {
      const o = overlap(c.profile.interests, user.interests);
      return (c.profile.gender === want ? 0 : 3) + (o >= 1 && o <= 2 ? 0 : o > 2 ? 0.5 : 2) + Math.abs(c.profile.birth_year - user.birth_year) * 0.3 + rand(seed, c.userId) * 0.2;
    };
    const best = rest.sort((a, b) => score(a) - score(b))[0];
    out.push(best);
    genders.push(best.profile.gender);
  }
  return out;
}

const FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];
const GIVEN = {
  M: ["민준", "도윤", "하준", "시우", "지호", "준서", "현우", "건우", "우진", "선우", "태윤", "재민", "승현", "동하"],
  F: ["서연", "지우", "서윤", "하은", "수아", "지민", "예린", "채원", "다인", "소율", "유나", "가은", "민서", "윤아"],
};
const JOBS = ["마케터", "개발자", "디자이너", "간호사", "대학원생", "회계사", "기획자", "교사", "PD", "연구원", "공무원", "바리스타", "약사", "은행원"];

export type NewBot = { name: string; profile: JoinProfile & { job: string; mbti: string; my_traits: string[]; wanted_traits: string[] } };

/** 새 봇 프로필: 사람과 나이 ±3, 관심사 1~2개 겹침, 성별은 정해 준 대로 */
export function makeBot(user: JoinProfile, gender: "M" | "F", seed: string): NewBot {
  const r = (k: string) => rand(seed, k);
  const pickN = <T,>(arr: readonly T[], k: number, key: string) => [...arr].sort((a, b) => r(`${key}:${a}`) - r(`${key}:${b}`)).slice(0, k);
  const shared = pickN(user.interests, Math.min(user.interests.length, 1 + (r("ov") < 0.5 ? 1 : 0)), "sh");
  const others = pickN(INTERESTS.filter((x) => !user.interests.includes(x)), 3 - shared.length, "ot");
  const birth = Math.max(1950, Math.min(2005, user.birth_year + Math.round((r("age") - 0.5) * 2 * AGE_NEAR)));
  return {
    name: `${FAMILY[Math.floor(r("fam") * FAMILY.length)]}${GIVEN[gender][Math.floor(r("giv") * GIVEN[gender].length)]}`,
    profile: {
      birth_year: birth,
      gender,
      interests: [...shared, ...others],
      price_range: user.price_range ?? "상관없어요",
      job: JOBS[Math.floor(r("job") * JOBS.length)],
      mbti: MBTIS[Math.floor(r("mbti") * MBTIS.length)],
      my_traits: pickN(TRAITS, 2, "mt"),
      wanted_traits: pickN(TRAITS, 1, "wt"),
    },
  };
}
