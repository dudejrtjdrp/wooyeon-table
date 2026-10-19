"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { roundCutoff } from "@/lib/policy";
import { sidoOf } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { logStatus } from "@/lib/events";
import { fmtSlot } from "@/lib/format";

/** 검증에 걸리면 고친 값을 그대로 돌려준다(f=JSON). 다시 처음부터 채우지 않게 */
function failRound(form: FormData, msg: string): never {
  const keep = {
    title: String(form.get("title") ?? ""),
    deadline: String(form.get("deadline") ?? ""),
    match_at: String(form.get("match_at") ?? ""),
    dates: form.getAll("dates").map(String),
    time: String(form.get("time") ?? ""),
    duration: String(form.get("duration") ?? ""),
    regions: form.getAll("regions").map(String),
    max_tables: String(form.get("max_tables") ?? ""),
  };
  redirect(`/admin/rounds?e=${encodeURIComponent(msg)}&f=${encodeURIComponent(JSON.stringify(keep))}#new-round`);
}

export async function createRound(form: FormData) {
  await requireAdminWrite("/admin/rounds");
  const title = String(form.get("title") ?? "").trim();
  const dates0 = form.getAll("dates").map(String).filter(Boolean);
  const time0 = String(form.get("time") ?? "19:30");
  // 비우면 운영 규칙대로 '모임 주 화요일 24:00'에 신청·환불·매칭을 함께 마감한다 (docs/prd/08-qna.md)
  const auto = roundCutoff(dates0.map((d) => `${d}T${time0}:00+09:00`));
  const fmtLocal = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16);
  const deadline = String(form.get("deadline") ?? "") || (auto ? fmtLocal(auto) : "");
  const matchAtRaw = String(form.get("match_at") ?? "") || deadline;
  const minutes = Math.max(60, Number(form.get("duration") ?? 150));
  const dates = form.getAll("dates").map(String).filter(Boolean);
  const time = String(form.get("time") ?? "19:30");
  const regions = form.getAll("regions").map(String).filter((r) => REGIONS.includes(r));
  const maxTables = Number(form.get("max_tables") ?? 4);
  if (!title || !dates.length || !regions.length) failRound(form, `${[!title && "이름", !dates.length && "날짜", !regions.length && "동네"].filter(Boolean).join(", ")}을(를) 채워 주세요`);
  if (!deadline) failRound(form, "신청 마감을 정하지 못했어요. 날짜를 다시 확인하거나 마감 시각을 직접 넣어 주세요");
  if (matchAtRaw < deadline) failRound(form, "자동 매칭은 신청 마감과 같거나 뒤여야 해요");
  if (!(maxTables >= 1)) failRound(form, "일정당 최대 테이블 수는 1 이상이어야 해요");

  const kst = (d: string, t: string) => new Date(`${d}T${t}:00+09:00`).toISOString();
  const { data: round } = await db()
    .from("rounds")
    .insert({ title, apply_deadline: kst(deadline.slice(0, 10), deadline.slice(11, 16)), match_at: kst(matchAtRaw.slice(0, 10), matchAtRaw.slice(11, 16)) })
    .select("id")
    .single();
  const rows = dates.flatMap((d) =>
    regions.map((region) => {
      const start = kst(d, time);
      return { round_id: round!.id, region, sido: sidoOf(region) ?? null, starts_at: start, ends_at: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(), max_tables: maxTables };
    }),
  );
  const { data: slots } = await db().from("slots").insert(rows).select("id,region");
  const { data: venues } = await db().from("venues").select("id,region").eq("active", true);
  const vs = (slots ?? []).flatMap((s) => (venues ?? []).filter((v) => v.region === s.region).map((v) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (vs.length) await db().from("venue_slots").insert(vs);
  // 이 동네가 열리길 기다리던 사람에게 알린다 (지역 수요 조사)
  const { data: waiting } = await db().from("region_demands").select("id,user_id,area").in("area", regions).is("notified_at", null);
  for (const w of waiting ?? []) {
    await notify({ userId: w.user_id, template: "region_open", title: `${w.area}에 테이블이 열렸어요`, body: `'${title}' 신청을 받아요`, link: `/apply/${round!.id}`, dedupeKey: `region_open:${w.id}:${round!.id}` });
    await db().from("region_demands").update({ notified_at: new Date().toISOString() }).eq("id", w.id);
  }
  revalidatePath("/admin/rounds");
  const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(kst(matchAtRaw.slice(0, 10), matchAtRaw.slice(11, 16))));
  redirect(`/admin/rounds?r=${round!.id}&m=${encodeURIComponent(`'${title}' 회차를 만들었어요. 일정 ${rows.length}개, 식당 재고 ${vs.length}칸이 잡혔고 ${when}에 매칭이 자동으로 돌아요. 결과는 자동 매칭 모니터에서 볼 수 있어요`)}`);
}


/** 식당 재고: 일정별로 이 식당이 받을 수 있는 테이블 수 */
export async function setCapacity(form: FormData) {
  const me = await requireAdminWrite("/admin/rounds");
  const venueId = String(form.get("venue_id"));
  const slotId = String(form.get("slot_id"));
  const n = Math.max(0, Math.min(20, Number(form.get("tables") ?? 0)));
  const [{ data: prev }, { data: v }, { data: sl }] = await Promise.all([
    db().from("venue_slots").select("tables_available").eq("venue_id", venueId).eq("slot_id", slotId).maybeSingle(),
    db().from("venues").select("name").eq("id", venueId).maybeSingle(),
    db().from("slots").select("starts_at,region").eq("id", slotId).maybeSingle(),
  ]);
  await db().from("venue_slots").upsert({ venue_id: venueId, slot_id: slotId, tables_available: n });
  // 식당 재고도 누가·언제·얼마로 바꿨는지 남긴다 (배정 결과가 달라지는 변경이라서)
  if ((prev?.tables_available ?? 0) !== n)
    await logStatus({ entityType: "venue", entityId: venueId, field: "tables_available", from: String(prev?.tables_available ?? 0), to: String(n), actor: `admin:${me.id}`, reason: `식당 재고: ${v?.name ?? "식당"}${sl ? ` · ${fmtSlot(sl.starts_at)} ${sl.region}` : ""} 받을 수 있는 테이블 ${prev?.tables_available ?? 0} → ${n}` });
  revalidatePath("/admin/rounds");
  const r = String(form.get("r") ?? "");
  redirect(`/admin/rounds?${r ? `r=${r}&` : ""}m=${encodeURIComponent(`받을 수 있는 테이블을 ${n}개로 바꿨어요. 다음 식당 배정부터 반영돼요`)}`);
}
