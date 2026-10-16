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
  // 후기는 이 테이블에 실제로 참석한(체크인한) 사람만 남긴다. 다음 매칭 입력이 되니 오지 않은 사람의 점수는 받지 않는다
  if (app.attendance_status !== "ATTENDED") redirect(`/tables/${tableId}?e=${encodeURIComponent("체크인한 모임에만 후기를 남길 수 있어요")}`);

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
  // 신고자와 대상이 실제로 이 테이블에 함께 배정됐던 사이인지 확인한다 (아무나 골라 신고·차단하지 못하게)
  const { data: seats } = await db().from("applications").select("user_id").eq("table_id", tableId).in("user_id", [me.id, target]);
  const seated = new Set((seats ?? []).map((x) => x.user_id));
  if (target === me.id || !seated.has(me.id) || !seated.has(target)) {
    redirect(`/tables/${tableId}/feedback?e=${encodeURIComponent("이 테이블에서 함께한 분만 신고할 수 있어요")}#report`);
  }

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
  // 이미 확정된 다음 모임에서 두 사람이 같은 테이블이면 필수 조건(차단·신고 관계 제외)이 깨진다 → 조건 충돌 예외 (15장)
  const { data: upcoming } = await db()
    .from("applications")
    .select("id,user_id,table_id,dining_tables!inner(status)")
    .in("user_id", [me.id, target])
    .eq("match_status", "CONFIRMED")
    .eq("attendance_status", "SCHEDULED")
    .not("table_id", "is", null)
    .neq("table_id", tableId);
  const rows = (upcoming ?? []) as unknown as { id: string; user_id: string; table_id: string; dining_tables: { status: string } }[];
  for (const t of rows.filter((x) => x.user_id === target && x.dining_tables.status !== "DONE")) {
    if (!rows.some((x) => x.user_id === me.id && x.table_id === t.table_id)) continue;
    await db().from("exceptions").upsert(
      { kind: "condition_conflict", ref_type: "application", ref_id: t.id, reason: "신고가 들어온 두 사람이 다음 모임에서 같은 테이블이에요. 한 분을 다른 테이블로 옮겨 주세요", dedupe_key: `conflict:${t.id}:${me.id}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }
  redirect(`/tables/${tableId}?m=${encodeURIComponent("신고가 접수됐어요. 앞으로 이분과는 같은 테이블에 앉지 않아요")}`);
}
