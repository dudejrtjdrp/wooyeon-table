"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { createTourRound, fillAttendance, moveClockTo } from "@/lib/demo-ops";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";
import { TOUR_KEY } from "@/lib/tour";
import { reapply, seedParticipants } from "../demo-actions";

type Tour = { roundId?: string; nextRoundId?: string };

export async function loadTour(): Promise<Tour> {
  const { data } = await db().from("settings").select("value").eq("key", TOUR_KEY).maybeSingle();
  return (data?.value as Tour | null) ?? {};
}
async function saveTour(v: Tour) {
  await db().from("settings").upsert({ key: TOUR_KEY, value: v }, { onConflict: "key" });
}

function done(msg: string): never {
  revalidatePath("/admin/tour");
  revalidatePath("/admin");
  redirect(`/admin/tour?m=${encodeURIComponent(msg)}#now`);
}

const fwd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set("back", "tour");
  return f;
};

/** 투어 버튼 하나. 지금 단계(step)에 맞는 일을 한다. 단계는 화면이 DB 상태로 계산해 넘긴다 */
export async function tourNext(form: FormData) {
  const me = await requireAdminWrite("/admin/tour");
  const step = String(form.get("step") ?? "");
  const tour = await loadTour();

  if (step === "start") {
    const id = await createTourRound(me.id);
    if (!id) done("회차를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요");
    await saveTour({ roundId: id! });
    await logStatus({ entityType: "setting", entityId: me.id, field: TOUR_KEY, from: tour.roundId ?? null, to: id!, actor: `admin:${me.id}`, reason: "심사 투어 시작" });
    done("시연 회차를 만들었어요. 이제 ② 참가자 모으기를 눌러 주세요");
  }
  const roundId = tour.roundId;
  if (!roundId) done("먼저 ① 시연 회차 만들기를 눌러 주세요");

  if (step === "gather") return seedParticipants(fwd({ round_id: roundId!, count: "36" }));
  if (step === "deadline") {
    const r = await moveClockTo("deadline", roundId!);
    done(r ? "마감이 지나 자동 매칭이 돌았어요. 아래 '확인해 보세요'에서 결과를 열어 보세요" : "마감 시각을 찾지 못했어요");
  }
  if (step === "dayBefore") {
    await moveClockTo("dayBefore", roundId!);
    done("모임 하루 전이에요. 리마인드 알림과 단체방 안내가 나갔어요");
  }
  if (step === "start_meet") {
    await moveClockTo("start", roundId!);
    done("모임이 시작됐어요. 단체방에 대화 주제가 올라왔어요");
  }
  if (step === "end") {
    const n = await fillAttendance(roundId!);
    await moveClockTo("end", roundId!);
    done(`모임이 끝났어요. 참가자 ${n}명이 체크인하고 후기를 남겼어요`);
  }
  if (step === "reapply") {
    let next = tour.nextRoundId;
    const { data: nr } = next ? await db().from("rounds").select("status").eq("id", next).maybeSingle() : { data: null };
    if (!nr || nr.status !== "open") {
      next = (await createTourRound(me.id, undefined, "심사 시연 다음")) ?? undefined;
      if (!next) done("다음 회차를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요");
      await saveTour({ roundId, nextRoundId: next });
    }
    return reapply(fwd({ round_id: roundId!, next_round_id: next! }));
  }
  if (step === "rematch") {
    if (!tour.nextRoundId) done("먼저 다음 회차에 다시 신청시켜 주세요");
    await moveClockTo("deadline", tour.nextRoundId!);
    done("다음 회차 매칭이 돌았어요. 후기에서 '다시는 싫어요'를 고른 사람끼리는 같은 테이블에 없어요");
  }
  done("이미 끝난 단계예요. 화면을 새로 고쳐 주세요");
}
