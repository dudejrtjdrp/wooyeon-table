"use client";

import { ArrowRight, Minus, Pencil, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { btnLight, btnPrimary } from "@/components/admin-classes";
import { AdminModal } from "@/components/admin-modal";
import { Term } from "@/components/term";
import { TIP } from "@/lib/admin-glossary";
import { DEFAULT_SETTINGS, type Weights } from "@/lib/matching/types";
import { type PastTable, previewSentence, previewTables } from "@/lib/weights-preview";
import { type Preset, WEIGHT_DESC, WEIGHT_KEYS, WEIGHT_LABEL, type WeightKey, matchPreset, priorityError, sameCriteria, shares, toHundred, weightSum } from "@/lib/weights-presets";
import { AddPresetForm, EditPresetForm } from "./preset-forms";

// 항목 색 (어드민 초록 계열, 흰 글자 4.5:1 이상). 막대·점·미리보기 칩에 같이 쓴다
const COLOR: Record<WeightKey, string> = { age: "#1e5e45", gender: "#2a7357", mbti: "#3f7a60", interests: "#5c7a26", wanted: "#8a5a00", fresh: "#8a5a44" };

export interface PastRound { id: string; title: string; tables: PastTable[] }

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(Math.round(x * 10) / 10)}`;
const pts = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1));

/** 100점을 항목끼리 나눠 갖는 가로 막대 */
function ShareBar({ w, size = "lg" }: { w: Record<string, number>; size?: "lg" | "sm" }) {
  const s = shares(w);
  const text = WEIGHT_KEYS.map((k) => `${WEIGHT_LABEL[k]} ${s[k]}점`).join(", ");
  return (
    <div role="img" aria-label={`100점 나눔: ${text}`} className={`flex w-full overflow-hidden ${size === "lg" ? "h-11 rounded-[14px]" : "h-2 rounded-full"} bg-line`}>
      {WEIGHT_KEYS.filter((k) => s[k] > 0).map((k) => (
        <div key={k} style={{ width: `${s[k]}%`, background: COLOR[k] }} className="flex min-w-0 items-center justify-center overflow-hidden transition-[width] duration-200 motion-reduce:transition-none">
          {size === "lg" && s[k] >= 9 && <span aria-hidden="true" className="truncate px-1 text-[12px] font-bold text-white">{WEIGHT_LABEL[k]} {s[k]}</span>}
        </div>
      ))}
    </div>
  );
}

function Stepper({ label, value, onChange, step, disabledDown, disabledUp, name, tone = "card" }: { label: string; value: number; onChange: (v: number) => void; step: number; disabledDown?: boolean; disabledUp?: boolean; name: string; tone?: "card" | "warn" }) {
  const b = `flex size-11 shrink-0 items-center justify-center rounded-xl border bg-card text-ink transition hover:border-accent disabled:opacity-40 ${tone === "warn" ? "border-[#e8d8ad]" : "border-line"}`;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" className={b} aria-label={`${label} ${step}점 줄이기`} disabled={disabledDown || value <= 0} onClick={() => onChange(value - step)}><Minus size={18} aria-hidden="true" /></button>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-14 rounded-xl border border-line bg-card text-center text-[17px] font-semibold tabular-nums text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
      />
      <button type="button" className={b} aria-label={`${label} ${step}점 늘리기`} disabled={disabledUp || value >= 100} onClick={() => onChange(value + step)}><Plus size={18} aria-hidden="true" /></button>
    </div>
  );
}

/** A12 매칭 기준: 템플릿 고르기 → 100점 나눔 조정 → 지난 테이블로 미리 보기 → 저장 */
export function WeightsForm({ initial, min, defaults, defaultMin, readOnly, action, presets, rounds }: {
  initial: Record<string, number>;
  min: number;
  defaults: Record<string, number>;
  defaultMin: number;
  readOnly?: boolean;
  action: (f: FormData) => void | Promise<void>;
  presets: Preset[];
  rounds: PastRound[];
}) {
  const [w, setW] = useState<Record<string, number>>(() => ({ ...initial }));
  const [minScore, setMinScore] = useState<number>(min);
  // 처음엔 테이블이 더 많은 회차를 보여 준다 (시연 회차처럼 한두 개뿐인 회차보다 비교가 잘 보이게)
  const [roundId, setRoundId] = useState(() => [...rounds].sort((a, b) => b.tables.length - a.tables.length)[0]?.id ?? "");
  const total = weightSum(w);
  const orderErr = priorityError(w);
  const s = shares(w);
  const set = (k: string, v: number) => setW((c) => ({ ...c, [k]: clamp(v) }));
  const dirty = !sameCriteria(w, minScore, initial, min);
  const saved = matchPreset(presets, initial, min);
  const picked = matchPreset(presets, w, minScore);
  const ids = { share: useId(), min: useId(), preview: useId() };

  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const preview = useMemo(
    () => (round ? previewTables(round.tables, { weights: initial as unknown as Weights, minScore: min }, { weights: w as unknown as Weights, minScore }) : null),
    [round, initial, min, w, minScore],
  );

  return (
    <div className="space-y-4">
      {/* ① 템플릿 */}
      <section id="presets" aria-labelledby={`${ids.share}-p`} className="shadow-card scroll-mt-6 rounded-[20px] bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${ids.share}-p`} className="text-[20px] font-bold tracking-[-0.02em] text-ink">어떤 테이블을 만들고 싶나요?</h2>
            <p className="mt-1 text-[14px] text-muted">
              <Term tip={TIP.매칭템플릿}>템플릿</Term>을 고르면 아래 숫자가 채워져요. 저장하기 전까지는 반영되지 않아요.
            </p>
            <p className="mt-2 text-[14px] font-semibold text-ink">
              지금 쓰는 기준: <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent-text">{saved ? saved.name : "직접 조정"}</span>
            </p>
          </div>
          {!readOnly && (
            <AdminModal
              label="새 템플릿 추가"
              icon={<Plus size={16} aria-hidden="true" />}
              title="새 템플릿 만들기"
              desc="이름을 붙이고 항목 점수와 최소 점수를 여기서 맞춰요. 기본값에서 시작하고, 숫자를 바꾸면 100점 나눔이 바로 보여요."
              triggerClassName={btnLight}
              resetOnClose
            >
              <AddPresetForm start={DEFAULT_SETTINGS.weights as unknown as Record<string, number>} startMin={DEFAULT_SETTINGS.minScore} />
            </AdminModal>
          )}
        </div>
        {presets.length === 0 ? (
          <p className="mt-4 rounded-xl bg-field px-4 py-5 text-center text-[14px] text-muted">템플릿이 없어요. &lsquo;새 템플릿 추가&rsquo;를 눌러 이름과 숫자를 정해 만들어 두세요.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {presets.map((p) => {
              const on = picked?.id === p.id;
              return (
                <li key={p.id} className={`relative flex flex-col rounded-[18px] border-2 p-4 transition ${on ? "border-accent bg-accent-soft/60" : "border-line bg-card hover:border-accent/50"}`}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setW({ ...p.weights }); setMinScore(p.minScore); }}
                    className="flex flex-1 flex-col gap-1.5 rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
                  >
                    <span className="flex flex-wrap items-center gap-1.5 pr-10">
                      <span className="text-[16px] font-bold text-ink">{p.name}</span>
                      {saved?.id === p.id && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">지금 쓰는 중</span>}
                      {priorityError(p.weights) && <span title={priorityError(p.weights) ?? ""} className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">우선순위 어김 · 고쳐야 저장돼요</span>}
                    </span>
                    {p.desc && <span className="text-[13px] leading-relaxed text-muted">{p.desc}</span>}
                    <span className="mt-auto pt-2"><ShareBar w={p.weights as unknown as Record<string, number>} size="sm" /></span>
                    <span className="text-[12px] text-muted">최소 점수 {p.minScore}점{on ? " · 골랐어요" : ""}</span>
                  </button>
                  {!readOnly && (
                    <div className="absolute right-2.5 top-2.5">
                      <AdminModal
                        label={<span className="sr-only">{p.name} 고치기</span>}
                        icon={<Pencil size={16} aria-hidden="true" />}
                        title={`'${p.name}' 템플릿 고치기`}
                        desc="이름·설명·값을 고치거나 지울 수 있어요."
                        triggerClassName="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-field hover:text-ink"
                      >
                        <EditPresetForm preset={p} />
                      </AdminModal>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ② 100점 나눔 + 최소 점수 + 저장 */}
      <form action={action}>
        <section aria-labelledby={ids.share} className="shadow-card rounded-[20px] bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id={ids.share} className="text-[20px] font-bold tracking-[-0.02em] text-ink">100점이 이렇게 나뉘어요</h2>
            <p className="text-[13px] text-muted">한 항목을 키우면 나머지 몫이 줄어요</p>
          </div>
          <p className="mt-1 text-[14px] text-muted">
            테이블 점수는 100점 만점이에요. 항목마다 <Term tip={TIP.최대점수}>최대 점수</Term>만큼 받을 수 있고, 덜 맞으면 덜 받아요.
          </p>
          <div className="mt-4"><ShareBar w={w} /></div>
          {total !== 100 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-field px-4 py-3">
              <p className="min-w-0 flex-1 text-[13px] text-ink2">
                지금 입력한 숫자의 합이 <b>{total}</b>이에요. {total > 0 ? "점수는 비율로 나눠 매겨서 결과는 같지만, 100으로 맞추면 숫자가 곧 최대 점수라 읽기 쉬워요." : "하나 이상은 0보다 커야 저장할 수 있어요."}
              </p>
              {total > 0 && <button type="button" onClick={() => setW({ ...toHundred(w) })} className={btnLight}>비율 그대로 100으로 맞추기</button>}
            </div>
          )}
          <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
            {WEIGHT_KEYS.map((k) => {
              const moved = s[k] - shares(initial)[k];
              return (
                <li key={k} className="flex flex-wrap items-center gap-3 rounded-2xl bg-field px-3.5 py-3 sm:flex-nowrap">
                  <span aria-hidden="true" className="size-3.5 shrink-0 rounded-[4px]" style={{ background: COLOR[k] }} />
                  <div className="min-w-0 flex-1 basis-[150px]">
                    <p className="text-[15px] font-bold text-ink">
                      {WEIGHT_LABEL[k]} <span className="text-accent">최대 {s[k]}점</span>
                      {moved !== 0 && <span className={`ml-1.5 whitespace-nowrap text-[12px] font-semibold ${moved > 0 ? "text-accent" : "text-warn"}`}><span className="sr-only">저장된 값보다 </span>{signed(moved)}</span>}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">{WEIGHT_DESC[k]} <span className="whitespace-nowrap">· 기본 {defaults[k] ?? 0}</span></p>
                  </div>
                  <Stepper name={k} label={`${WEIGHT_LABEL[k]} 점수`} value={w[k] ?? 0} step={1} onChange={(v) => set(k, v)} />
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3.5">
            <p id={ids.min} className="min-w-0 flex-1 basis-[240px] text-[14px] text-ink2">
              <b className="text-ink"><Term tip={TIP.최소점수}>최소 점수</Term> {minScore}점</b> · 이보다 낮은 테이블은 자동으로 확정하지 않고 자동 재배치로 넘겨요. 기본값은 {defaultMin}점이에요.
            </p>
            <Stepper name="min_score" label="최소 점수" value={minScore} step={5} tone="warn" onChange={(v) => setMinScore(clamp(v))} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {readOnly ? (
              <p className="text-[13px] text-muted">조회 전용 계정이라 저장할 수 없어요. 숫자를 바꿔 아래 미리보기만 해 볼 수 있어요.</p>
            ) : (
              <>
                <button disabled={!dirty || total <= 0 || Boolean(orderErr)} className={`${btnPrimary} h-12 px-6 text-[15px] disabled:opacity-50`}>이 기준으로 저장</button>
                <p className={`min-w-0 flex-1 text-[13px] ${orderErr ? "font-semibold text-danger" : "text-muted"}`} aria-live="polite">
                  {orderErr ? orderErr : dirty ? <>저장하지 않은 변경이 있어요{picked ? ` (${picked.name})` : ""}. 저장하면 다음 자동 매칭부터 적용돼요.</> : "저장된 기준 그대로예요. 바꾼 기록은 변경 이력에서 되돌릴 수 있어요."}
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {dirty && <button type="button" onClick={() => { setW({ ...initial }); setMinScore(min); }} className="h-11 rounded-xl px-3 text-[13px] font-semibold text-muted underline underline-offset-4 hover:text-ink">저장된 값으로</button>}
              {!sameCriteria(w, minScore, defaults, defaultMin) && <button type="button" onClick={() => { setW({ ...defaults }); setMinScore(defaultMin); }} className="h-11 rounded-xl px-3 text-[13px] font-semibold text-muted underline underline-offset-4 hover:text-ink">엔진 기본값으로</button>}
            </div>
          </div>
        </section>
      </form>

      {/* ③ 지난 테이블로 미리 보기 */}
      <section aria-labelledby={ids.preview} className="shadow-card rounded-[20px] bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h2 id={ids.preview} className="text-[20px] font-bold tracking-[-0.02em] text-ink">지난 테이블로 미리 보기</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">이건 지난 테이블 점수를 새 기준으로 다시 계산해 본 거예요. 실제 조합은 매칭 엔진이 새로 짜니 달라질 수 있어요.</p>
          </div>
          {rounds.length > 1 && (
            <div role="group" aria-label="미리 볼 회차" className="flex max-w-full flex-wrap gap-1 rounded-xl bg-field p-1">
              {rounds.map((r) => (
                <button key={r.id} type="button" aria-pressed={r.id === round?.id} onClick={() => setRoundId(r.id)} className={`min-h-10 rounded-lg px-3 text-[13px] font-semibold ${r.id === round?.id ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"}`}>
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {!round || !preview || round.tables.length === 0 ? (
          <p className="mt-4 rounded-xl bg-field px-4 py-5 text-center text-[14px] text-muted">아직 확정된 테이블이 없어 미리 볼 수 없어요. 첫 회차가 매칭되면 여기서 비교해 볼 수 있어요.</p>
        ) : (
          <>
            <div aria-live="polite" className={`mt-4 rounded-2xl px-4 py-4 ${preview.belowAfter > 0 ? "bg-warn-soft" : "bg-accent-soft/60"}`}>
              <p className="text-[16px] font-bold leading-snug text-ink">{previewSentence(preview, `'${round.title}'`)}</p>
              <p className="mt-1.5 text-[13px] text-ink2">
                {!preview.changed
                  ? "지금은 저장된 기준과 같아요. 템플릿을 고르거나 숫자를 바꾸면 테이블마다 점수가 어떻게 달라지는지 바로 보여요."
                  : <>
                      최소 점수 미달 <b>{preview.belowBefore}개 → {preview.belowAfter}개</b>
                      {preview.top && <> · 가장 크게 움직인 항목: <b style={{ color: COLOR[preview.top.key] }}>{WEIGHT_LABEL[preview.top.key]}</b> (테이블 평균 {signed(preview.top.delta)}점)</>}
                    </>}
              </p>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {preview.rows.map((r) => {
                // 최소 점수와 견주는 건 확정 판정 점수라 그걸 크게 보여 준다. 조합 고를 때 쓰는 점수(성비 감점 포함)는 작게
                const d = Math.round((r.gateAfter - r.gateBefore) * 10) / 10;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3">
                    <div className="min-w-0 flex-1 basis-[180px]">
                      <p className="truncate text-[14px] font-semibold text-ink">{r.label}</p>
                      <p className="text-[12px] text-muted">조합 점수 {pts(r.before)}{r.after !== r.before ? ` → ${pts(r.after)}` : ""}점 (성비 감점 포함, 조합 고를 때만 씀)</p>
                    </div>
                    {r.top && <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: COLOR[r.top.key] }}>{WEIGHT_LABEL[r.top.key]} {signed(r.top.delta)}</span>}
                    {r.below && <span className="rounded-full bg-warn px-2 py-0.5 text-[12px] font-semibold text-white">최소 점수 미달</span>}
                    <p className="flex shrink-0 items-center gap-1.5 text-[15px] tabular-nums" aria-label={`확정 판정 점수 ${pts(r.gateBefore)}점에서 ${pts(r.gateAfter)}점`}>
                      <span className="text-[12px] text-muted">확정 판정</span>
                      <span className="text-muted">{pts(r.gateBefore)}</span>
                      <ArrowRight size={14} className="text-muted" aria-hidden="true" />
                      <b className="text-[17px] text-ink">{pts(r.gateAfter)}점</b>
                      <span className={`w-12 text-right text-[12px] font-semibold ${d > 0 ? "text-accent" : d < 0 ? "text-warn" : "text-muted"}`}>{d === 0 ? "같음" : signed(d)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
