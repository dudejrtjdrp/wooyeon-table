"use client";

import { useActionState, useState } from "react";
import { btnDanger, btnPrimary, ctl } from "@/components/admin-classes";
import { PRESET_DESC_MAX, PRESET_NAME_MAX, type Preset, WEIGHT_KEYS, WEIGHT_LABEL, shares, valueError, weightSum } from "@/lib/weights-presets";
import { ConfirmButton } from "../confirm-button";
import { type PresetState, addPreset, deletePreset, updatePreset } from "./preset-actions";

const num = "h-11 w-full rounded-xl border border-line bg-card px-2 text-center text-[16px] font-semibold text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";

function NameDesc({ state, preset }: { state: PresetState; preset?: Preset }) {
  return (
    <>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink">이름</span>
        <input name="name" required maxLength={PRESET_NAME_MAX} defaultValue={state.values?.name ?? preset?.name ?? ""} autoComplete="off" placeholder="예: 주말 브런치용" className={`${ctl} mt-1.5 w-full`} />
      </label>
      <label className="mt-3 block">
        <span className="text-[13px] font-semibold text-ink">한 줄 설명 <span className="font-normal text-muted">(골라 쓸 때 보여요, {PRESET_DESC_MAX}자까지)</span></span>
        <input name="desc" maxLength={PRESET_DESC_MAX} defaultValue={state.values?.desc ?? preset?.desc ?? ""} autoComplete="off" placeholder="예: 관심사가 겹치는 사람끼리 묶어요." className={`${ctl} mt-1.5 w-full`} />
      </label>
    </>
  );
}

type Vals = { w: Record<string, number>; setW: (w: Record<string, number>) => void; min: number; setMin: (n: number) => void; err: string | null };

/** 입력칸 값. 실패해서 돌아왔으면 적었던 값으로, 아니면 시작 값으로 */
function useVals(start: Record<string, number>, startMin: number, state: PresetState): Vals {
  const [w, setW] = useState<Record<string, number>>(() => Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Number(state.values?.[k] ?? start[k] ?? 0)])));
  const [min, setMin] = useState(() => Number(state.values?.min_score ?? startMin));
  return { w, setW, min, setMin, err: valueError(w, min) };
}

const toNum = (v: string) => (v === "" ? NaN : Number(v));

/** 항목 점수·최소 점수 입력칸. 바꾸면 100점 나눔 막대와 숫자 검사(서버와 같은 규칙)가 바로 따라온다 */
function ValueFields({ v }: { v: Vals }) {
  const { w, setW, min, setMin, err } = v;
  const s = shares(w);
  const sum = weightSum(w);
  return (
    <fieldset className="mt-4">
      <legend className="text-[13px] font-semibold text-ink">항목 점수 <span className="font-normal text-muted">(0~100, 합이 100이면 그대로 최대 점수예요)</span></legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="block rounded-xl bg-field p-2.5">
            <span className="text-[12px] font-semibold text-muted">{WEIGHT_LABEL[k]}</span>
            <input name={k} type="number" inputMode="numeric" min={0} max={100} step={1} required value={Number.isFinite(w[k]) ? w[k] : ""} onChange={(e) => setW({ ...w, [k]: toNum(e.target.value) })} className={`${num} mt-1`} />
          </label>
        ))}
        <label className="block rounded-xl bg-warn-soft p-2.5">
          <span className="text-[12px] font-semibold text-warn">최소 점수</span>
          <input name="min_score" type="number" inputMode="numeric" min={0} max={100} step={1} required value={Number.isFinite(min) ? min : ""} onChange={(e) => setMin(toNum(e.target.value))} className={`${num} mt-1`} />
        </label>
      </div>
      <div className="mt-3 rounded-xl bg-field px-4 py-3" aria-live="polite">
        <p className="text-[13px] font-semibold text-ink">100점이 이렇게 나뉘어요{sum > 0 && sum !== 100 && <span className="font-normal text-muted"> (지금 합 {sum}, 비율로 나눠 보여 줘요)</span>}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{WEIGHT_KEYS.map((k) => `${WEIGHT_LABEL[k]} ${s[k]}`).join(" · ")} · 최소 점수 {Number.isFinite(min) ? min : "-"}</p>
        {err && <p className="mt-1.5 text-[12px] font-semibold text-danger">{err}</p>}
      </div>
    </fieldset>
  );
}

/** 새 템플릿: 늘 기본값에서 시작해(닫았다 열면 처음으로) 모달 안에서 숫자를 맞춰 만든다 */
export function AddPresetForm({ start, startMin }: { start: Record<string, number>; startMin: number }) {
  const [state, action, pending] = useActionState(addPreset, {});
  return <AddInner key={state.error ?? "new"} state={state} action={action} pending={pending} start={start} startMin={startMin} />;
}

function AddInner({ state, action, pending, start, startMin }: { state: PresetState; action: (f: FormData) => void; pending: boolean; start: Record<string, number>; startMin: number }) {
  const v = useVals(start, startMin, state);
  return (
    <form action={action}>
      <NameDesc state={state} />
      <ValueFields v={v} />
      {state.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{state.error}</p>}
      <button disabled={pending || !!v.err} className={`${btnPrimary} mt-4 w-full disabled:opacity-60`}>{pending ? "만드는 중" : v.err ? "숫자를 먼저 맞춰 주세요" : "템플릿 만들기"}</button>
      <p className="mt-2 text-center text-[12px] text-muted">템플릿을 만들어도 지금 매칭 기준은 바뀌지 않아요. 쓰려면 목록에서 고른 뒤 &lsquo;이 기준으로 저장&rsquo;을 눌러 주세요.</p>
    </form>
  );
}

/** 이름·설명·값 고치기와 지우기 */
export function EditPresetForm({ preset }: { preset: Preset }) {
  const [state, action, pending] = useActionState(updatePreset, {});
  return <EditInner key={state.error ?? preset.id} preset={preset} state={state} action={action} pending={pending} />;
}

function EditInner({ preset, state, action, pending }: { preset: Preset; state: PresetState; action: (f: FormData) => void; pending: boolean }) {
  const v = useVals(preset.weights as unknown as Record<string, number>, preset.minScore, state);
  return (
    <>
      <form action={action}>
        <input type="hidden" name="id" value={preset.id} />
        <NameDesc state={state} preset={preset} />
        <ValueFields v={v} />
        {state.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{state.error}</p>}
        <button disabled={pending || !!v.err} className={`${btnPrimary} mt-4 w-full disabled:opacity-60`}>{pending ? "고치는 중" : v.err ? "숫자를 먼저 맞춰 주세요" : "고친 내용 저장"}</button>
        <p className="mt-2 text-center text-[12px] text-muted">템플릿만 바뀌어요. 지금 매칭 기준을 바꾸려면 템플릿을 고른 뒤 &lsquo;이 기준으로 저장&rsquo;을 눌러 주세요.</p>
      </form>
      <form action={deletePreset} className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <input type="hidden" name="id" value={preset.id} />
        <p className="text-[13px] text-muted">더 안 쓰는 템플릿이면 지워요.</p>
        <ConfirmButton confirm={`'${preset.name}' 템플릿을 지울까요? 지금 쓰는 매칭 기준은 그대로 남아요.`} className={btnDanger}>템플릿 지우기</ConfirmButton>
      </form>
    </>
  );
}
