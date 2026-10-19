"use client";

import { useActionState } from "react";
import { btnDanger, btnPrimary, ctl } from "@/components/admin-classes";
import { PRESET_DESC_MAX, PRESET_NAME_MAX, type Preset, WEIGHT_KEYS, WEIGHT_LABEL, shares, weightSum } from "@/lib/weights-presets";
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

/** 지금 화면의 값(저장 전이어도)을 새 템플릿으로 */
export function AddPresetForm({ weights, minScore }: { weights: Record<string, number>; minScore: number }) {
  const [state, action, pending] = useActionState(addPreset, {});
  const s = shares(weights);
  return (
    <form action={action} key={state.error ?? "new"}>
      <NameDesc state={state} />
      {WEIGHT_KEYS.map((k) => <input key={k} type="hidden" name={k} value={weights[k] ?? 0} />)}
      <input type="hidden" name="min_score" value={minScore} />
      <div className="mt-4 rounded-xl bg-field px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">이 값으로 만들어요</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {WEIGHT_KEYS.map((k) => `${WEIGHT_LABEL[k]} ${s[k]}`).join(" · ")} · 최소 점수 {minScore}
        </p>
        {weightSum(weights) !== 100 && <p className="mt-1 text-[12px] text-muted">합이 100점이 아니라 비율로 나눈 몫을 보여 줘요. 저장하는 값은 입력한 숫자 그대로예요.</p>}
      </div>
      {state.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{state.error}</p>}
      <button disabled={pending} className={`${btnPrimary} mt-4 w-full disabled:opacity-60`}>{pending ? "만드는 중" : "템플릿 만들기"}</button>
      <p className="mt-2 text-center text-[12px] text-muted">템플릿을 만들어도 지금 매칭 기준은 바뀌지 않아요.</p>
    </form>
  );
}

/** 이름·설명·값 고치기와 지우기 */
export function EditPresetForm({ preset }: { preset: Preset }) {
  const [state, action, pending] = useActionState(updatePreset, {});
  const v = (k: string, d: number) => state.values?.[k] ?? String(d);
  return (
    <>
      <form action={action} key={state.error ?? preset.id}>
        <input type="hidden" name="id" value={preset.id} />
        <NameDesc state={state} preset={preset} />
        <fieldset className="mt-4">
          <legend className="text-[13px] font-semibold text-ink">항목 점수 <span className="font-normal text-muted">(합이 100이면 그대로 최대 점수예요)</span></legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {WEIGHT_KEYS.map((k) => (
              <label key={k} className="block rounded-xl bg-field p-2.5">
                <span className="text-[12px] font-semibold text-muted">{WEIGHT_LABEL[k]}</span>
                <input name={k} type="number" inputMode="numeric" min={0} max={100} step={1} required defaultValue={v(k, preset.weights[k])} className={`${num} mt-1`} />
              </label>
            ))}
            <label className="block rounded-xl bg-warn-soft p-2.5">
              <span className="text-[12px] font-semibold text-warn">최소 점수</span>
              <input name="min_score" type="number" inputMode="numeric" min={0} max={100} step={1} required defaultValue={v("min_score", preset.minScore)} className={`${num} mt-1`} />
            </label>
          </div>
        </fieldset>
        {state.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{state.error}</p>}
        <button disabled={pending} className={`${btnPrimary} mt-4 w-full disabled:opacity-60`}>{pending ? "고치는 중" : "고친 내용 저장"}</button>
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
