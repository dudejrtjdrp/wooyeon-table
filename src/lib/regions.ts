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
 * '가까운 동네도 괜찮아요'를 켠 사람이 고른 묶음에서 4명이 안 모일 때 옮겨 갈 수 있는 일정.
 * 같은 시·도 안의 다른 묶음, 같은 날짜만. 거리 제한은 아직 정하지 않았다(보류).
 */
export function nearSlotsFor(picked: string[], dates: string[], slots: SlotLike[]): string[] {
  const own = new Set(slotsFor(picked, dates, slots));
  const sidos = new Set(picked.map(sidoOf).filter(Boolean) as string[]);
  const days = new Set(dates);
  return slots
    .filter((s) => !own.has(s.id) && sidos.has(s.sido ?? sidoOf(s.region) ?? "") && days.has(dayOf(s.starts_at)))
    .map((s) => s.id);
}

/** "성수·건대 외 2곳" */
export function areasLabel(picked: string[]): string {
  if (!picked.length) return "동네 미정";
  return picked.length === 1 ? picked[0] : `${picked[0]} 외 ${picked.length - 1}곳`;
}

export { dayOf as kstDay };
