"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { db } from "@/lib/supabase";

export async function createRound(form: FormData) {
  await requireAdmin();
  const title = String(form.get("title") ?? "").trim();
  const deadline = String(form.get("deadline"));
  const matchAtRaw = String(form.get("match_at") ?? "") || deadline;
  const minutes = Math.max(60, Number(form.get("duration") ?? 150));
  const dates = form.getAll("dates").map(String).filter(Boolean);
  const time = String(form.get("time") ?? "19:30");
  const regions = form.getAll("regions").map(String).filter((r) => (REGIONS as readonly string[]).includes(r));
  const maxTables = Number(form.get("max_tables") ?? 4);
  if (matchAtRaw < deadline) redirect(`/admin/rounds?e=${encodeURIComponent("자동 매칭은 신청 마감과 같거나 뒤여야 해요")}`);
  if (!title || !deadline || !dates.length || !regions.length) redirect(`/admin/rounds?e=${encodeURIComponent("이름, 마감, 날짜, 동네를 모두 채워 주세요")}`);

  const kst = (d: string, t: string) => new Date(`${d}T${t}:00+09:00`).toISOString();
  const { data: round } = await db()
    .from("rounds")
    .insert({ title, apply_deadline: kst(deadline.slice(0, 10), deadline.slice(11, 16)), match_at: kst(matchAtRaw.slice(0, 10), matchAtRaw.slice(11, 16)) })
    .select("id")
    .single();
  const rows = dates.flatMap((d) =>
    regions.map((region) => {
      const start = kst(d, time);
      return { round_id: round!.id, region, starts_at: start, ends_at: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(), max_tables: maxTables };
    }),
  );
  const { data: slots } = await db().from("slots").insert(rows).select("id,region");
  const { data: venues } = await db().from("venues").select("id,region").eq("active", true);
  const vs = (slots ?? []).flatMap((s) => (venues ?? []).filter((v) => v.region === s.region).map((v) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (vs.length) await db().from("venue_slots").insert(vs);
  revalidatePath("/admin/rounds");
  redirect("/admin/rounds");
}

export async function addVenue(form: FormData) {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const region = String(form.get("region"));
  const address = String(form.get("address") ?? "").trim();
  if (!name || !address) redirect(`/admin/rounds?e=${encodeURIComponent("식당 이름과 주소를 채워 주세요")}`);
  const { data: v } = await db().from("venues").insert({ name, region, address, price_range: String(form.get("price") ?? "") || null }).select("id").single();
  const { data: slots } = await db().from("slots").select("id,rounds!inner(status)").eq("region", region).eq("rounds.status", "open");
  if (slots?.length) await db().from("venue_slots").insert(slots.map((s) => ({ venue_id: v!.id, slot_id: s.id, tables_available: 2 })));
  revalidatePath("/admin/rounds");
}

/** 식당 재고: 일정별로 이 식당이 받을 수 있는 테이블 수 */
export async function setCapacity(form: FormData) {
  await requireAdmin();
  const venueId = String(form.get("venue_id"));
  const slotId = String(form.get("slot_id"));
  const n = Math.max(0, Math.min(20, Number(form.get("tables") ?? 0)));
  await db().from("venue_slots").upsert({ venue_id: venueId, slot_id: slotId, tables_available: n });
  revalidatePath("/admin/rounds");
}
