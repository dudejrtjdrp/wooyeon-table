// 지역은 "시·도 → 동네 묶음" 두 단계로 고른다. 매칭의 지역 단위는 동네 묶음이다.
// 묶음은 2026-10-16 임시안(프로젝트 문서 claude/지역-묶음.md). 식당 섭외 지역이 정해지면 다시 맞춘다.
// slots.region에는 묶음 이름, slots.sido에는 시·도 이름이 들어간다.

export interface Sido {
  name: string;
  areas: string[];
}

export const SIDOS: Sido[] = [
  { name: "서울", areas: ["강남·역삼·선릉", "신사·압구정·청담", "성수·건대", "홍대·합정·연남", "신촌·이대", "을지로·종로·광화문", "용산·이태원·한남", "여의도·영등포", "잠실·송파", "마곡·목동"] },
  { name: "경기", areas: ["판교·분당", "수원·광교", "용인 수지·기흥", "동탄", "일산·고양", "부천", "안양·평촌", "하남·미사", "의정부"] },
  { name: "인천", areas: ["송도", "부평", "구월·남동", "청라"] },
  { name: "부산", areas: ["서면", "해운대·센텀", "광안리·수영", "남포·부산역"] },
  { name: "대구", areas: ["동성로", "수성구"] },
  { name: "대전", areas: ["둔산", "유성"] },
  { name: "광주", areas: ["상무지구", "동명동·충장로"] },
  { name: "제주", areas: ["제주시", "서귀포"] },
];

/** "서울 전체"처럼 시·도 전체를 고른 값 */
export const wholeOf = (sido: string) => `${sido} 전체`;
export const isWhole = (v: string) => v.endsWith(" 전체");

const SIDO_OF = new Map<string, string>(SIDOS.flatMap((s) => s.areas.map((a) => [a, s.name] as const)));

export function sidoOf(area: string): string | undefined {
  if (isWhole(area)) return area.replace(/ 전체$/, "");
  return SIDO_OF.get(area);
}

/** 고른 값(묶음 또는 "○○ 전체")을 실제 묶음 목록으로 편다 */
export function expandAreas(picked: string[]): string[] {
  const out = new Set<string>();
  for (const p of picked) {
    if (isWhole(p)) {
      const s = SIDOS.find((x) => wholeOf(x.name) === p);
      s?.areas.forEach((a) => out.add(a));
    } else if (SIDO_OF.has(p)) out.add(p);
  }
  return [...out];
}

export interface SlotLike {
  id: string;
  region: string;
  sido?: string | null;
  starts_at: string;
}

const dayOf = (iso: string) => {
  // 한국 시간 기준 날짜
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
};

/** 고른 동네·날짜로 지원 대상 일정을 고른다 */
export function slotsFor(picked: string[], dates: string[], slots: SlotLike[]): string[] {
  const areas = new Set(expandAreas(picked));
  const days = new Set(dates);
  return slots.filter((s) => areas.has(s.region) && days.has(dayOf(s.starts_at))).map((s) => s.id);
}

/**
 * 붙어 있는 동네 (2026-10-16 임시안). '가까운 동네도 괜찮아요'를 켜도 여기 적힌 이웃까지만 옮긴다.
 * 기준: 지하철로 대략 30분 안, 갈아타기 1번 이내. 시·도 경계를 넘을 수 있다(잠실↔하남, 목동↔부천).
 * 한쪽만 적어도 양쪽으로 이어진다.
 */
const NEIGHBOR_PAIRS: [string, string][] = [
  ["강남·역삼·선릉", "신사·압구정·청담"], ["강남·역삼·선릉", "잠실·송파"], ["강남·역삼·선릉", "판교·분당"],
  ["신사·압구정·청담", "성수·건대"], ["신사·압구정·청담", "용산·이태원·한남"],
  ["성수·건대", "잠실·송파"], ["성수·건대", "을지로·종로·광화문"],
  ["홍대·합정·연남", "신촌·이대"], ["홍대·합정·연남", "여의도·영등포"], ["홍대·합정·연남", "마곡·목동"], ["홍대·합정·연남", "일산·고양"],
  ["신촌·이대", "을지로·종로·광화문"],
  ["을지로·종로·광화문", "용산·이태원·한남"],
  ["용산·이태원·한남", "여의도·영등포"],
  ["여의도·영등포", "마곡·목동"], ["여의도·영등포", "안양·평촌"],
  ["잠실·송파", "하남·미사"],
  ["마곡·목동", "부천"],
  ["판교·분당", "용인 수지·기흥"], ["수원·광교", "용인 수지·기흥"], ["수원·광교", "동탄"], ["용인 수지·기흥", "동탄"],
  ["부천", "부평"],
  ["송도", "구월·남동"], ["부평", "구월·남동"], ["부평", "청라"],
  ["서면", "광안리·수영"], ["서면", "남포·부산역"], ["광안리·수영", "해운대·센텀"],
  ["동성로", "수성구"], ["둔산", "유성"], ["상무지구", "동명동·충장로"],
];
const NEIGHBORS = new Map<string, Set<string>>();
for (const [a, b] of NEIGHBOR_PAIRS) {
  if (!NEIGHBORS.has(a)) NEIGHBORS.set(a, new Set());
  if (!NEIGHBORS.has(b)) NEIGHBORS.set(b, new Set());
  NEIGHBORS.get(a)!.add(b);
  NEIGHBORS.get(b)!.add(a);
}

/** 고른 동네들과 붙어 있는 동네 (고른 동네는 뺀다) */
export function neighborsOf(picked: string[]): string[] {
  const own = new Set(expandAreas(picked));
  const out = new Set<string>();
  for (const a of own) for (const n of NEIGHBORS.get(a) ?? []) if (!own.has(n)) out.add(n);
  return [...out];
}

/**
 * '가까운 동네도 괜찮아요'를 켠 사람이 고른 동네에서 4명이 안 모일 때 옮겨 갈 수 있는 일정.
 * 붙어 있는 동네(NEIGHBOR_PAIRS)의 같은 날짜 일정만.
 */
export function nearSlotsFor(picked: string[], dates: string[], slots: SlotLike[]): string[] {
  const near = new Set(neighborsOf(picked));
  const days = new Set(dates);
  return slots.filter((s) => near.has(s.region) && days.has(dayOf(s.starts_at))).map((s) => s.id);
}

/** "성수·건대 외 2곳" */
export function areasLabel(picked: string[]): string {
  if (!picked.length) return "동네 미정";
  return picked.length === 1 ? picked[0] : `${picked[0]} 외 ${picked.length - 1}곳`;
}

export { dayOf as kstDay };
