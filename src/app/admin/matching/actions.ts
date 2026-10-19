"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runMatchNow } from "@/lib/admin-manual";
import { requireAdminWrite } from "@/lib/auth";

/** 자동 매칭 지금 돌리기: 매칭 시각 전이라도 운영자가 바로 실행한다. 판단은 lib/admin-manual-rules.ts, 잠금은 러너(match_runs unique) */
export async function runNowAction(form: FormData) {
  const roundId = String(form.get("r") ?? "");
  const me = await requireAdminWrite(`/admin/matching?r=${roundId}`);
  const r = await runMatchNow(roundId, me.id);
  revalidatePath("/admin/matching");
  revalidatePath("/admin");
  redirect(`/admin/matching?r=${roundId}&${r.ok ? "m" : "e"}=${encodeURIComponent(r.message)}`);
}
