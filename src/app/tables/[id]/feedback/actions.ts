"use server";

import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";

const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return n >= 1 && n <= 5 ? n : null;
};

export async function submitFeedback(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const { data: app } = await db()
    .from("applications")
    .select("id,attendance_status")
    .eq("table_id", tableId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (!app) redirect("/");

  await db().from("feedbacks").upsert({
    application_id: app.id,
    user_id: me.id,
    table_id: tableId,
    mood_score: score(form.get("mood")),
    talk_score: score(form.get("talk")),
    venue_score: score(form.get("venue")),
    rejoin_intent: score(form.get("rejoin")),
    recommend_intent: score(form.get("recommend")),
    comment: String(form.get("comment") ?? "").trim() || null,
  });

  // 사람별 선호는 비공개로 저장하고 다음 매칭에 반영한다 (FDB-04)
  const { data: others } = await db().from("applications").select("user_id").eq("table_id", tableId).neq("user_id", me.id);
  for (const o of others ?? []) {
    const v = String(form.get(`pref_${o.user_id}`) ?? "");
    if (v === "again" || v === "avoid") {
      await db().from("person_prefs").upsert({ from_user: me.id, to_user: o.user_id, table_id: tableId, pref: v });
    } else {
      await db().from("person_prefs").delete().eq("from_user", me.id).eq("to_user", o.user_id).eq("table_id", tableId);
    }
  }
  await logStatus({ entityType: "application", entityId: app.id, field: "feedback", to: "SUBMITTED", actor: `user:${me.id}`, reason: "후기 제출" });
  redirect(`/?m=${encodeURIComponent("후기 고마워요. 다음 테이블을 꾸릴 때 반영할게요")}`);
}

/** 신고·차단 (SAF-01). 신고 내용은 상대에게 보이지 않는다 */
export async function report(form: FormData) {
  const me = await requireMe();
  const tableId = String(form.get("table_id"));
  const target = String(form.get("target"));
  const reason = String(form.get("reason") ?? "");
  const detail = String(form.get("detail") ?? "").trim();
  if (!target || !reason) redirect(`/tables/${tableId}/feedback?e=${encodeURIComponent("신고할 사람과 이유를 골라 주세요")}#report`);

  const { data: rep } = await db()
    .from("safety_reports")
    .insert({ reporter_id: me.id, reported_id: target, table_id: tableId, reason, detail: detail || null })
    .select("id")
    .single();
  await db().from("blocks").upsert({ blocker_id: me.id, blocked_id: target });
  await db().from("exceptions").upsert(
    { kind: "safety", ref_type: "safety_report", ref_id: rep!.id, reason: `안전 신고: ${reason}`, dedupe_key: `safety:${rep!.id}` },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  redirect(`/tables/${tableId}?m=${encodeURIComponent("신고가 접수됐어요. 앞으로 이분과는 같은 테이블에 앉지 않아요")}`);
}
