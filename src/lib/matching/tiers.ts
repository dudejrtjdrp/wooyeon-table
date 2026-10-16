// 재배치 우선순위 (PRD 7.4). 엔진(engine.ts findReallocTarget)과 확정 뒤 재배치(reflow-rules.ts planReflow)가 같은 순서를 쓴다.
//   1 같은 날짜·같은 지역 → 2 같은 날짜·다른 선택 지역 → 3 다른 선택 날짜·같은 지역 → 4 다른 선택 날짜·다른 선택 지역
// 5(선택 안 한 일정 추천)와 6(보관·환불)은 참가자가 고르는 단계라 여기서 자동으로 옮기지 않는다.

/** 날짜 비교는 한국 시간 기준 날짜로 한다 */
const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export type TierSlot = { region: string; startsAt: string };

/** home(원래 일정)에서 target 일정으로 옮길 때의 순위와 참가자에게 보여 줄 설명. home이 없으면 4순위 */
export function reallocTier(home: TierSlot | undefined, target: TierSlot): { tier: 1 | 2 | 3 | 4; label: string } {
  if (!home) return { tier: 4, label: "고르신 다른 일정" };
  const sameDate = kstDate(target.startsAt) === kstDate(home.startsAt);
  const sameRegion = target.region === home.region;
  if (sameDate && sameRegion) return { tier: 1, label: "같은 날짜·같은 지역의 다른 테이블" };
  if (sameDate) return { tier: 2, label: `같은 날 ${target.region} 테이블` };
  if (sameRegion) return { tier: 3, label: `${target.region}의 다른 날짜 테이블` };
  return { tier: 4, label: `고르신 다른 일정(${target.region})` };
}
