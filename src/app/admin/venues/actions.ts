"use server";

import { revalidatePath } from "next/cache";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";
import { matchPhotoName, parseVenueRow, type VenueRow } from "@/lib/venue-sheet";
import { saveVenuePhoto } from "@/lib/venue-photo";
import { readVenueWorkbook } from "@/lib/venue-xlsx";

export type ImportResult = { ok: boolean; added: number; updated: number; skipped: { line: number; why: string }[]; message: string };

/** 엑셀로 식당 넣기: 같은 동네·같은 이름이면 고치고, 없으면 새로 만든다. 새 식당은 모집 중인 일정에 2테이블씩 잡는다 */
export async function importVenues(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  const me = await requireAdminWrite("/admin/venues");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, added: 0, updated: 0, skipped: [], message: "엑셀 파일을 골라 주세요" };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, added: 0, updated: 0, skipped: [], message: "양식(.xlsx) 파일만 올릴 수 있어요. 양식을 내려받아 채워 주세요" };
  let parsed: Awaited<ReturnType<typeof readVenueWorkbook>>;
  try {
    parsed = await readVenueWorkbook(await file.arrayBuffer());
  } catch {
    return { ok: false, added: 0, updated: 0, skipped: [], message: "엑셀 파일을 읽지 못했어요. 양식을 내려받아 다시 채워 주세요" };
  }
  if (parsed.missing.length) return { ok: false, added: 0, updated: 0, skipped: [], message: `첫 줄에 ${parsed.missing.join("·")} 칸이 없어요. 양식 그대로 써 주세요` };
  if (!parsed.rows.length) return { ok: false, added: 0, updated: 0, skipped: [], message: "채워진 줄이 없어요" };

  const skipped: ImportResult["skipped"] = [];
  const good: { line: number; v: VenueRow }[] = [];
  const seen = new Set<string>();
  for (const { line, raw } of parsed.rows) {
    if (String(raw["식당 이름"] ?? "").startsWith("예시)")) continue; // 양식의 예시 줄
    const r = parseVenueRow(raw);
    if (!r.ok) { skipped.push({ line, why: r.errors.join(", ") }); continue; }
    const k = `${r.value.region}|${r.value.name}`;
    if (seen.has(k)) { skipped.push({ line, why: "위 줄과 같은 동네·같은 이름이에요" }); continue; }
    seen.add(k);
    good.push({ line, v: r.value });
  }

  const { data: existing } = await db().from("venues").select("id,name,region,photo_url");
  const byKey = new Map((existing ?? []).map((v) => [`${v.region}|${v.name}`, v]));
  let added = 0, updated = 0;
  for (const { line, v } of good) {
    const cur = byKey.get(`${v.region}|${v.name}`);
    // 사진 주소 칸이 비어 있으면 이미 올린 사진을 지우지 않는다
    const row = { ...v, photo_url: v.photo_url ?? cur?.photo_url ?? null };
    if (cur) {
      const { error } = await db().from("venues").update(row).eq("id", cur.id);
      if (error) skipped.push({ line, why: "저장하지 못했어요" }); else updated++;
    } else {
      const { data: ins, error } = await db().from("venues").insert(row).select("id").single();
      if (error || !ins) { skipped.push({ line, why: "저장하지 못했어요" }); continue; }
      added++;
      const { data: slots } = await db().from("slots").select("id,rounds!inner(status)").eq("region", v.region).eq("rounds.status", "open");
      if (slots?.length && v.active) await db().from("venue_slots").insert(slots.map((s) => ({ venue_id: ins.id, slot_id: s.id, tables_available: 2 })));
    }
  }
  await logStatus({ entityType: "venue", entityId: me.id, field: "import", to: `${added}/${updated}`, actor: `admin:${me.id}`, reason: `엑셀로 식당 넣기: 새로 ${added}곳, 고침 ${updated}곳, 건너뜀 ${skipped.length}줄 (${file.name})` });
  revalidatePath("/admin/venues");
  revalidatePath("/admin/rounds");
  return {
    ok: added + updated > 0,
    added, updated, skipped,
    message: `새로 ${added}곳, 고친 곳 ${updated}곳${skipped.length ? `, 건너뛴 줄 ${skipped.length}개` : ""}`,
  };
}

/** 식당 하나에 사진 올리기 (브라우저가 줄여서 보낸다) */
export async function uploadVenuePhoto(form: FormData): Promise<{ ok: boolean; message: string }> {
  const me = await requireAdminWrite("/admin/venues");
  const id = String(form.get("venue_id") ?? "");
  const file = form.get("photo");
  if (!id || !(file instanceof File)) return { ok: false, message: "사진을 골라 주세요" };
  const err = await saveVenuePhoto(id, file);
  if (err) return { ok: false, message: err };
  await logStatus({ entityType: "venue", entityId: id, field: "photo", to: "uploaded", actor: `admin:${me.id}`, reason: "식당 사진 올림" });
  revalidatePath("/admin/venues");
  return { ok: true, message: "사진을 바꿨어요" };
}

/** 여러 장 한 번에: 파일 이름을 식당 이름(또는 동네_이름)으로 맞춰 찾는다. 한 번에 한 장씩 불린다 */
export async function uploadPhotoByName(form: FormData): Promise<{ ok: boolean; message: string }> {
  const me = await requireAdminWrite("/admin/venues");
  const file = form.get("photo");
  const name = String(form.get("name") ?? "");
  if (!(file instanceof File)) return { ok: false, message: "사진이 없어요" };
  const { data: venues } = await db().from("venues").select("id,name,region");
  const v = matchPhotoName(name, venues ?? []);
  if (!v) return { ok: false, message: `${name}: 이 이름의 식당을 찾지 못했어요` };
  const err = await saveVenuePhoto(v.id, file);
  if (err) return { ok: false, message: `${name}: ${err}` };
  await logStatus({ entityType: "venue", entityId: v.id, field: "photo", to: "uploaded", actor: `admin:${me.id}`, reason: `식당 사진 올림(여러 장): ${name}` });
  revalidatePath("/admin/venues");
  return { ok: true, message: `${v.name}` };
}
