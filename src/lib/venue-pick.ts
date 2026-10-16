// 식당 고르기 (INF-02, PRD 15장 '식당 배정 실패'). DB 없이 계산하는 부분만 따로 둬서 테스트로 바로 확인한다.
// 순서: 같은 지역·일정에서 자리가 남고 인원이 앉을 수 있는 식당만 → 평점 4.3 이상 + 자동 예약 채널(네이버·캐치테이블)을 먼저
// → 평점 높은 순 → 이 일정에 덜 쓴 식당 → 이름 순(같은 입력이면 같은 결과).
// 예약이 3번 실패한 식당은 exclude로 빼고 다시 고른다. 후보가 하나도 안 남을 때만 운영자 예외.

/** 배정할 때 먼저 고르는 평점 (운영사 Q&A: 리뷰 평점이 좋은 곳) */
export const GOOD_RATING = 4.3;
/** 자동으로 예약 요청을 보낼 수 있는 채널. 전화 예약은 사람이 걸어야 해서 가점이 없다 */
export const AUTO_CHANNELS = ["naver", "catchtable"] as const;

export type VenueOption = {
  venueId: string;
  name: string;
  region: string;
  active: boolean;
  rating: number | null;
  channel: string | null;
  seats: number;
  /** 이 일정에 이 식당이 받을 수 있는 테이블 수 */
  tablesAvailable: number;
};

export type VenueNeed = {
  region: string;
  party: number;
  /** 이 일정에 이미 배정된 테이블 수 (식당별) */
  used: Map<string, number>;
  /** 이미 시도했다가 예약이 안 된 식당 */
  exclude?: Set<string>;
};

export const isAutoChannel = (c: string | null | undefined) => (AUTO_CHANNELS as readonly string[]).includes(c ?? "");

/** 배정 우선 점수: 평점 기준을 넘으면 1, 자동 예약 채널이면 1 */
export const venueGrade = (v: Pick<VenueOption, "rating" | "channel">) => Number((v.rating ?? 0) >= GOOD_RATING) + Number(isAutoChannel(v.channel));

/** 배정할 수 있는 식당을 좋은 순으로 */
export function rankVenues(options: VenueOption[], need: VenueNeed): VenueOption[] {
  const used = (id: string) => need.used.get(id) ?? 0;
  return options
    .filter((o) => o.active && o.region === need.region)
    .filter((o) => !need.exclude?.has(o.venueId))
    .filter((o) => used(o.venueId) < o.tablesAvailable)
    .filter((o) => (o.seats || 6) >= need.party)
    .sort(
      (a, b) =>
        venueGrade(b) - venueGrade(a) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        used(a.venueId) - used(b.venueId) ||
        a.name.localeCompare(b.name) ||
        a.venueId.localeCompare(b.venueId),
    );
}

/** 가장 좋은 식당 하나. 없으면 null (그때만 운영자 예외) */
export const pickVenue = (options: VenueOption[], need: VenueNeed): VenueOption | null => rankVenues(options, need)[0] ?? null;
