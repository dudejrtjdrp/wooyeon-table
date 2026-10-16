import { expect, it } from "vitest";
import { DEFAULT_REGIONS } from "../../constants";
import { runMatching } from "../engine";
import { type Candidate, DEFAULT_SETTINGS, type Slot } from "../types";

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32); }
const INTERESTS = ["맛집 탐방","여행","운동","영화·드라마","음악·공연","책","전시·미술","와인·술","게임","사진","커리어","반려동물"];
const TRAITS = ["유쾌한","차분한","다정한","솔직한","호기심 많은","리액션 좋은","진지한","에너지 넘치는"];
const MBTIS = ["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"];
// 운영 지역 4곳(운영사 Q&A: 홍대·잠실·강남·을지로) × 금·토 저녁
const slots: Slot[] = DEFAULT_REGIONS.flatMap((region) => ["2026-10-23T10:30:00Z","2026-10-24T10:00:00Z"].map((d) => ({ id: `${region}-${d.slice(8,10)}`, region, startsAt: d, maxTables: 4 })));

it("시드와 같은 분포: 신청이 몰린 홍대·강남, 적은 을지로, 나이 차가 큰 두 명", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = rng(seed);
    const pick = <T,>(a: readonly T[], k: number) => [...a].sort(() => r() - 0.5).slice(0, k);
    const main = slots.filter((s) => s.region === "홍대·합정·연남" || s.region === "강남·역삼·선릉");
    const thin = slots.filter((s) => s.region === "을지로·종로·광화문").slice(0, 1);
    const n = 37;
    const cands: Candidate[] = Array.from({ length: n }, (_, i) => ({
      applicationId: `a${String(i).padStart(2,"0")}`, userId: `u${i}`, gender: r() < 0.5 ? "M" : "F",
      birthYear: i >= n - 2 ? 1982 : 1994 + Math.floor(r() * 8), mbti: MBTIS[Math.floor(r() * 16)],
      interests: pick(INTERESTS, 3), myTraits: pick(TRAITS, 2), wantedTraits: pick(TRAITS, 1),
      slotIds: (i < 3 ? thin : i >= n - 2 ? pick(slots, 1) : pick(main, 1 + Math.floor(r() * 2))).map((s) => s.id),
    }));
    const res = runMatching(cands, slots, { excluded: new Set(), met: new Set(), again: new Set() });

    // 어떤 시드에서도 필수 조건은 깨지지 않는다 (M3·M4·M6), 모든 사람이 확정 또는 실패 안내 중 하나를 받는다(누락 없음)
    const byApp = new Map(cands.map((c) => [c.applicationId, c]));
    for (const t of res.tables) {
      expect(t.applicationIds.length).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minSize);
      expect(t.applicationIds.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxSize);
      const years = t.applicationIds.map((id) => byApp.get(id)!.birthYear);
      expect(Math.max(...years) - Math.min(...years)).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxAgeGap);
      for (const id of t.applicationIds) expect(byApp.get(id)!.slotIds).toContain(t.slotId);
    }
    expect(Object.keys(res.outcomes).sort()).toEqual(cands.map((c) => c.applicationId).sort());
  }
});
