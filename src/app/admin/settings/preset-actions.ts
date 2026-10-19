"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import type { Weights } from "@/lib/matching/types";
import { db } from "@/lib/supabase";
import { type Preset, WEIGHT_KEYS, parsePresets, presetError, presetValue } from "@/lib/weights-presets";

/** 템플릿 모달이 받는 결과. 안 될 때는 적은 값을 그대로 돌려줘서 입력칸이 비지 않게 한다 */
export type PresetState = { error?: string; values?: Record<string, string> };

const BACK = "/admin/settings";
const KEY = "matching.presets";

async function load(): Promise<Preset[]> {
  const { data } = await db().from("settings").select("value").eq("key", KEY).maybeSingle();
  return parsePresets(data?.value);
}

async function store(list: Preset[]) {
  await db().from("settings").upsert({ key: KEY, value: list });
}

const int = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? NaN : Number(s);
};

function read(form: FormData) {
  const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const weights = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, int(form.get(k))])) as Record<string, number>;
  return {
    values,
    input: { name: String(form.get("name") ?? "").trim(), desc: String(form.get("desc") ?? "").trim(), weights, minScore: int(form.get("min_score")) },
  };
}

const done = (msg: string) => {
  revalidatePath(BACK);
  redirect(`${BACK}?m=${encodeURIComponent(msg)}#presets`);
};

/** 템플릿 추가: 지금 화면의 값(저장 전이어도)을 이름 붙여 남긴다 */
export async function addPreset(_prev: PresetState, form: FormData): Promise<PresetState> {
  const me = await requireAdminWrite(`${BACK}#presets`);
  const { values, input } = read(form);
  const list = await load();
  const err = presetError(input, list);
  if (err) return { error: err, values };
  const p: Preset = { id: randomUUID().slice(0, 8), name: input.name, desc: input.desc, weights: input.weights as unknown as Weights, minScore: input.minScore };
  await store([...list, p]);
  await logStatus({ entityType: "setting", entityId: me.id, field: KEY, from: null, to: presetValue(p)!, actor: `admin:${me.id}`, reason: "매칭 템플릿 추가" });
  done(`'${p.name}' 템플릿을 만들었어요`);
  return {};
}

/** 템플릿 고치기: 이름·설명·항목 점수·최소 점수 */
export async function updatePreset(_prev: PresetState, form: FormData): Promise<PresetState> {
  const me = await requireAdminWrite(`${BACK}#presets`);
  const id = String(form.get("id") ?? "");
  const { values, input } = read(form);
  const list = await load();
  const old = list.find((p) => p.id === id);
  if (!old) return { error: "이미 지워진 템플릿이에요. 화면을 새로 고쳐 주세요", values };
  const err = presetError(input, list, id);
  if (err) return { error: err, values };
  const next: Preset = { ...old, name: input.name, desc: input.desc, weights: input.weights as unknown as Weights, minScore: input.minScore };
  if (presetValue(old) === presetValue(next)) return { error: "바뀐 것이 없어요", values };
  await store(list.map((p) => (p.id === id ? next : p)));
  await logStatus({ entityType: "setting", entityId: me.id, field: KEY, from: presetValue(old), to: presetValue(next)!, actor: `admin:${me.id}`, reason: "매칭 템플릿 수정" });
  done(`'${next.name}' 템플릿을 고쳤어요`);
  return {};
}

/** 템플릿 지우기. 지금 쓰는 매칭 기준(저장된 값)은 그대로 남는다 */
export async function deletePreset(form: FormData) {
  const me = await requireAdminWrite(`${BACK}#presets`);
  const id = String(form.get("id") ?? "");
  const list = await load();
  const old = list.find((p) => p.id === id);
  if (!old) redirect(`${BACK}?e=${encodeURIComponent("이미 지워진 템플릿이에요")}#presets`);
  await store(list.filter((p) => p.id !== id));
  // 삭제는 새 값이 없어서 빈 글자로 남긴다 (이력 화면: "매칭 템플릿 '…' 삭제")
  await logStatus({ entityType: "setting", entityId: me.id, field: KEY, from: presetValue(old!), to: "", actor: `admin:${me.id}`, reason: "매칭 템플릿 삭제" });
  done(`'${old!.name}' 템플릿을 지웠어요. 지금 쓰는 매칭 기준은 그대로예요`);
}
