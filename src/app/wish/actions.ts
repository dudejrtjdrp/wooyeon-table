"use server";

import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { OPEN_REGIONS } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { SIDOS } from "@/lib/regions";
import { db } from "@/lib/supabase";

/** 아직 열지 않은 지역 수요 남기기 (운영사 Q&A: 서울 4곳 먼저, 나머지는 나중) */
export async function saveWish(form: FormData) {
  const me = await requireMe();
  const sido = String(form.get("sido") ?? "");
  const pick = String(form.get("area") ?? "");
  const typed = String(form.get("typed") ?? "").trim().slice(0, 40);
  const note = String(form.get("note") ?? "").trim().slice(0, 200);
  const s = SIDOS.find((x) => x.name === sido);
  const from = form.get("from") === "home" ? "&from=home" : ""; // 홈에서 들어왔으면 뒤로 가기가 홈으로 가게 유지
  const back = (m: string) => redirect(`/wish?sido=${encodeURIComponent(sido)}${from}&e=${encodeURIComponent(m)}`);
  if (!s && sido !== "그 밖") back("시·도를 골라 주세요");
  const area = pick && s?.areas.includes(pick) ? pick : typed || null;
  if (!area) back("동네를 고르거나 직접 적어 주세요");
  if (area && OPEN_REGIONS.includes(area)) redirect(`/rounds?m=${encodeURIComponent(`${area}는 지금 신청할 수 있어요`)}`);
  // 같은 동네를 두 번 남기면 하나만
  const { data: dup } = await db().from("region_demands").select("id").eq("user_id", me.id).eq("sido", sido).eq("area", area!).maybeSingle();
  if (!dup) {
    const { data: row } = await db().from("region_demands").insert({ user_id: me.id, sido, area, note: note || null }).select("id").single();
    if (row) await logStatus({ entityType: "region_demand", entityId: row.id, field: "created", to: `${sido} ${area}`, actor: `user:${me.id}`, reason: "열리면 알려 달라고 남김" });
  }
  redirect(`/wish?m=${encodeURIComponent(`${area}에 열리면 바로 알려 드릴게요`)}${from}`);
}

export async function removeWish(form: FormData) {
  const me = await requireMe();
  await db().from("region_demands").delete().eq("id", String(form.get("id"))).eq("user_id", me.id).is("notified_at", null);
  redirect(form.get("from") === "home" ? "/wish?from=home" : "/wish");
}
