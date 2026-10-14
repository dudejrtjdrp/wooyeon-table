import { Lock } from "lucide-react";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/matching/types";
import { db } from "@/lib/supabase";
import { WeightsForm } from "./weights-form";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };

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
    <div>
      <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">매칭 기준</h1>
      <p className="mt-1.5 text-[15px] text-muted">다음 매칭에 적용할 선호 점수를 조정해요.</p>
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] bg-accent-soft/60 px-6 py-5">
        <Lock size={30} className="text-accent" />
        <div className="flex-1">
          <p className="text-[19px] font-bold text-ink">바꿀 수 없는 필수 조건</p>
          <p className="mt-0.5 text-[14px] text-muted">모든 매칭에 공통으로 적용되는 기본 조건이에요. 자동 재배치에서도 완화하지 않아요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["같은 일정", "4~6명", "나이 차 8살 이내", "차단·신고·비선호 제외"].map((x) => (
            <span key={x} className="rounded-full bg-card px-4 py-2 text-[14px] font-semibold text-accent">{x}</span>
          ))}
        </div>
      </section>
      <div className="mt-4">
        <WeightsForm keys={Object.keys(DEFAULT_SETTINGS.weights)} labels={LABEL} initial={w} min={min} action={save} />
      </div>
    </div>
  );
}
