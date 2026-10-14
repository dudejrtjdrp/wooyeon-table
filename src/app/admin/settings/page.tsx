import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/matching/types";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI 궁합", interests: "공통 관심사", wanted: "희망 성향", fresh: "새로운 사람" };

async function save(form: FormData) {
  "use server";
  await requireAdmin();
  const weights = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.weights).map((k) => [k, Math.max(0, Number(form.get(k) ?? 0))]));
  const min = Math.min(100, Math.max(0, Number(form.get("min_score") ?? 55)));
  await db().from("settings").upsert([{ key: "matching.weights", value: weights }, { key: "matching.min_score", value: min }]);
  revalidatePath("/admin/settings");
}

export default async function Settings() {
  await requireAdmin();
  const { data } = await db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const w = { ...DEFAULT_SETTINGS.weights, ...(map.get("matching.weights") ?? {}) } as Record<string, number>;
  const min = Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore);

  return (
    <div className="max-w-xl">
      <h1 className="text-[24px] font-bold">매칭 기준</h1>
      <p className="mt-1 text-[14px] text-muted">
        필수 조건(일정, 4~6명, 나이 차 8살, 차단·신고·비선호)은 바꿀 수 없어요. 아래 가중치는 선호 점수에만 쓰여요. 다음 매칭부터 적용돼요.
      </p>
      <form action={save} className="mt-6 space-y-3 rounded-2xl border border-line bg-card p-5">
        {Object.keys(DEFAULT_SETTINGS.weights).map((k) => (
          <label key={k} className="flex items-center justify-between text-[14px]">
            {LABEL[k]}
            <input name={k} type="number" defaultValue={w[k]} min={0} className="w-24 rounded-lg border border-line px-3 py-1.5 text-right" />
          </label>
        ))}
        <label className="flex items-center justify-between border-t border-line pt-3 text-[14px] font-medium">
          자동 확정 최소 점수 (0~100)
          <input name="min_score" type="number" defaultValue={min} min={0} max={100} className="w-24 rounded-lg border border-line px-3 py-1.5 text-right" />
        </label>
        <button className="w-full rounded-lg bg-ink py-2.5 text-[14px] text-white">저장</button>
      </form>
    </div>
  );
}
