"use client";

import Image from "next/image";
import { useState } from "react";

const DESC: Record<string, string> = {
  age: "비슷한 연령대의 편안한 대화",
  gender: "테이블 구성의 균형",
  mbti: "대화 성향의 조합",
  interests: "함께 이야기할 공통 주제",
  wanted: "만나고 싶은 사람의 특성",
  fresh: "이전에 만나지 않은 사람 우선",
};

/** D8 선호 점수 가중치: 슬라이더와 숫자 칸이 함께 움직이고, 오른쪽에 합계와 식탁 그림을 보여준다 */
export function WeightsForm({ keys, labels, initial, min, defaults, defaultMin, readOnly, action }: { keys: string[]; labels: Record<string, string>; initial: Record<string, number>; min: number; defaults: Record<string, number>; defaultMin: number; readOnly?: boolean; action: (f: FormData) => void | Promise<void> }) {
  const [w, setW] = useState<Record<string, number>>(initial);
  // 최소 점수 기본값은 매칭 엔진 기본값(DEFAULT_SETTINGS.minScore)을 그대로 받는다
  const [minScore, setMinScore] = useState<number>(min);
  const total = keys.reduce((n, k) => n + (Number(w[k]) || 0), 0);
  const set = (k: string, v: number) => setW((c) => ({ ...c, [k]: Math.max(0, Math.min(100, Math.round(v))) }));
  const badge = <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 align-middle text-[11px] font-semibold text-accent">필수</span>;
  const pos = ["left-1/2 top-0 -translate-x-1/2", "right-0 top-[22%]", "right-0 bottom-[22%]", "left-1/2 bottom-0 -translate-x-1/2", "left-0 bottom-[22%]", "left-0 top-[22%]"];
  return (
    <form action={action}>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="shadow-card rounded-[20px] bg-card p-6">
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink">선호 점수 가중치</h2>
          <p className="mt-1 text-[14px] text-muted">매칭 때 각 항목을 얼마나 중요하게 볼지 정해요. 합이 100점이 되도록 맞추면 읽기 쉬워요.</p>
          <ul className="mt-4 divide-y divide-line">
            {keys.map((k) => (
              <li key={k} className="flex items-center gap-5 py-4">
                <div className="w-48 shrink-0">
                  <p className="text-[17px] font-bold text-ink">{labels[k]}{badge}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{DESC[k]} <span className="whitespace-nowrap">(기본 {defaults[k] ?? 0}점)</span></p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={w[k] ?? 0}
                  onChange={(e) => set(k, Number(e.target.value))}
                  disabled={readOnly}
                  aria-label={`${labels[k]} 가중치`}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--accent)]"
                  style={{ background: `linear-gradient(to right, var(--accent) ${(Math.min(w[k] ?? 0, 50) / 50) * 100}%, var(--line) 0)` }}
                />
                <span className="flex items-center gap-2 text-[14px] text-muted">
                  <input name={k} type="number" min={0} max={100} value={w[k] ?? 0} readOnly={readOnly} onChange={(e) => set(k, Number(e.target.value))} className="h-12 w-[72px] rounded-xl border border-line text-center text-[18px] font-semibold text-ink outline-none focus:border-accent" />
                  점
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="shadow-card rounded-[20px] bg-card p-6">
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink">설정된 총점</h2>
          <p className="mt-1 text-[14px] text-muted">모든 항목의 점수를 합한 값이에요.</p>
          <p className={`mt-3 text-[56px] font-bold leading-none tracking-[-0.03em] ${total === 100 ? "text-accent" : "text-warn"}`}>{total}<span className="ml-1 text-[22px]">점</span></p>
          {total !== 100 && <p className="mt-2 text-[13px] text-warn">100점에 맞추면 항목별 비중을 비교하기 쉬워요.</p>}
          <div className="relative mx-auto mt-6 aspect-square w-full max-w-[320px]">
            <div className="absolute inset-[18%] rounded-full border border-dashed border-accent/30" />
            <div className="absolute inset-[24%]"><Image src="/images/dining/generated/09-table-object.png" alt="" fill sizes="200px" className="object-contain" /></div>
            {keys.slice(0, 6).map((k, i) => (
              <span key={k} className={`absolute ${pos[i]} rounded-2xl bg-card/95 px-3 py-1.5 text-center shadow-card`}>
                <span className="block text-[12px] text-muted">{labels[k]}</span>
                <span className="block text-[17px] font-bold text-accent">{w[k] ?? 0}점</span>
              </span>
            ))}
          </div>
        </section>
      </div>
      <section className="shadow-card mt-4 flex flex-wrap items-center gap-5 rounded-[20px] bg-card p-6">
        <div className="flex-1">
          <p className="text-[19px] font-bold text-ink">자동 확정 최소 점수{badge}</p>
          <p className="mt-1 text-[14px] text-muted">이 점수 이상이면 운영자 검토 없이 자동으로 확정돼요. 매칭 엔진 기본값은 {defaultMin}점이에요.</p>
        </div>
        <span className="flex items-center gap-2 text-[14px] text-muted">
          <input name="min_score" type="number" value={minScore} readOnly={readOnly} onChange={(e) => setMinScore(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))} min={0} max={100} className="h-12 w-[80px] rounded-xl border border-line text-center text-[18px] font-semibold text-ink outline-none focus:border-accent" />점
        </span>
        {readOnly ? (
          <p className="text-[13px] text-muted">조회 전용 계정이라 기준을 바꿀 수 없어요.</p>
        ) : (
          <div className="text-center">
            <button className="shadow-cta h-12 w-60 rounded-xl bg-accent text-[16px] font-semibold text-white">저장</button>
            <button type="button" onClick={() => { setW({ ...defaults }); setMinScore(defaultMin); }} className="mt-1.5 block w-full text-[12px] text-muted underline underline-offset-4 hover:text-ink">기본값으로 되돌리기 (저장해야 반영)</button>
            <p className="mt-1 text-[12px] text-muted">다음 매칭부터 적용돼요.</p>
          </div>
        )}
      </section>
    </form>
  );
}
