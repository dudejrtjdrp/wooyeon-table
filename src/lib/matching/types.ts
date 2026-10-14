// 매칭 엔진 입력·출력 타입. DB와 분리된 순수 계산 모듈이라 테스트로 바로 검증할 수 있다.
// 규칙 문서: docs/02-matching-rules.md

export const ALGORITHM_VERSION = "2026.10.15-2";

export type Gender = "M" | "F";

export interface Candidate {
  applicationId: string;
  userId: string;
  birthYear: number;
  gender: Gender;
  mbti: string | null;
  interests: string[];
  myTraits: string[];
  wantedTraits: string[];
  /** 신청 때 고른 일정. 고른 순서대로 */
  slotIds: string[];
}

export interface Slot {
  id: string;
  region: string;
  /** ISO 문자열. 날짜 비교에 쓴다 */
  startsAt: string;
  maxTables: number;
}

export interface Relations {
  /** 같은 테이블에 앉으면 안 되는 쌍 (차단·신고·비선호). key는 pairKey(userA, userB) */
  excluded: Set<string>;
  /** 이전에 같은 테이블에서 만난 쌍 */
  met: Set<string>;
  /** 서로 다시 만나고 싶다고 한 쌍 (한쪽만이어도 포함) */
  again: Set<string>;
}

export interface Weights {
  age: number;
  gender: number;
  mbti: number;
  interests: number;
  wanted: number;
  fresh: number;
}

export interface MatchSettings {
  weights: Weights;
  minScore: number;
  minSize: number;
  maxSize: number;
  maxAgeGap: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  weights: { age: 25, gender: 22, mbti: 18, interests: 15, wanted: 12, fresh: 8 },
  minScore: 50,
  minSize: 4,
  maxSize: 6,
  maxAgeGap: 8,
};

export interface ScoreDetail {
  /** 항목별 0~1 점수 */
  parts: Record<keyof Weights, number>;
  /** 다시 만나고 싶은 쌍 가산점 */
  bonus: number;
  /** 0~100 (+가산점) */
  total: number;
  ageGap: number;
  oldestBirthYear: number;
  youngestBirthYear: number;
  male: number;
  female: number;
  mbtiList: string[];
  commonInterests: string[];
  wantedMet: number;
  wantedTotal: number;
  metPairs: number;
  totalPairs: number;
}

export interface TableResult {
  slotId: string;
  applicationIds: string[];
  score: ScoreDetail;
  /** 참가자에게 보여줄 묶인 이유 (상위 3개) */
  reasons: string[];
  /** 이 테이블이 만들어진 경로: 처음 묶임 / 재배치로 합류 / 남은 사람끼리 새로 묶음 */
  origin: "initial" | "merged";
}

export type Outcome =
  | {
      status: "CONFIRMED";
      tableIndex: number;
      reallocCount: number;
      /** 참가자에게 보여줄 처리 설명 */
      message: string;
    }
  | {
      status: "ALTERNATIVE_OFFERED";
      reallocCount: number;
      message: string;
    };

export interface RunResult {
  version: string;
  tables: TableResult[];
  outcomes: Record<string, Outcome>;
  summary: {
    candidates: number;
    tablesCreated: number;
    splitSlots: number;
    dissolved: number;
    reallocated: number;
    merged: number;
    confirmed: number;
    failed: number;
  };
  /** 운영자 모니터용 처리 기록 */
  log: string[];
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
