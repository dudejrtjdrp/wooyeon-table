import { it } from "vitest";
import { runMatching } from "../engine";
import type { Candidate, Slot } from "../types";

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32); }
const INTERESTS = ["맛집 탐방","여행","운동","영화·드라마","음악·공연","책","전시·미술","와인·술","게임","사진","커리어","반려동물"];
const TRAITS = ["유쾌한","차분한","다정한","솔직한","호기심 많은","리액션 좋은","진지한","에너지 넘치는"];
const MBTIS = ["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"];
const slots: Slot[] = ["성수","강남","홍대","여의도"].flatMap((region) => ["2026-10-23T10:30:00Z","2026-10-24T10:00:00Z"].map((d) => ({ id: `${region}-${d.slice(8,10)}`, region, startsAt: d, maxTables: 4 })));

it("시드와 같은 분포", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = rng(seed);
    const pick = <T,>(a: readonly T[], k: number) => [...a].sort(() => r() - 0.5).slice(0, k);
    const main = slots.filter((s) => s.region === "성수" || s.region === "강남");
    const thin = slots.filter((s) => s.region === "홍대").slice(0, 1);
    const n = 37;
    const cands: Candidate[] = Array.from({ length: n }, (_, i) => ({
      applicationId: `a${String(i).padStart(2,"0")}`, userId: `u${i}`, gender: r() < 0.5 ? "M" : "F",
      birthYear: i >= n - 2 ? 1982 : 1994 + Math.floor(r() * 8), mbti: MBTIS[Math.floor(r() * 16)],
      interests: pick(INTERESTS, 3), myTraits: pick(TRAITS, 2), wantedTraits: pick(TRAITS, 1),
      slotIds: (i < 3 ? thin : i >= n - 2 ? pick(slots, 1) : pick(main, 1 + Math.floor(r() * 2))).map((s) => s.id),
    }));
    const res = runMatching(cands, slots, { excluded: new Set(), met: new Set(), again: new Set() });

    console.log("SIM", seed, JSON.stringify(res.summary), res.tables.map((t) => `${t.slotId}:${t.applicationIds.length}:${t.score.total}`).join(" "));
  }
});
