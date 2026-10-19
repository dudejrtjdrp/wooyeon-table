"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";
import { COLUMNS, matchPhotoName, parseVenueRow, type VenueRow } from "@/lib/venue-sheet";
import { saveVenuePhoto } from "@/lib/venue-photo";
import { readVenueWorkbook } from "@/lib/venue-xlsx";

export type ImportResult = {
  ok: boolean;
  /** true면 아직 아무것도 바꾸지 않은 미리보기다. 운영자가 확인한 뒤 같은 파일로 다시 보낸다 */
  preview: boolean;
  added: number;
  updated: number;
  inventory: number;
  skipped: { line: number; why: string }[];
  changes: { name: string; how: "추가" | "고침"; fields: string[] }[];
  message: string;
};

const MAX_ROWS = 500;
const FIELD_LABEL: Record<string, string> = { category: "업종", address: "주소", price_range: "가격대", rating: "평점", review_count: "리뷰 수", booking_channel: "예약 채널", booking_url: "예약 페이지", phone: "전화", map_url: "지도 링크", seats_per_table: "좌석", active: "사용" };
const fail = (message: string): ImportResult => ({ ok: false, preview: false, added: 0, updated: 0, inventory: 0, skipped: [], changes: [], message });

/**
 * 사용 중인 식당이 모집 중인 같은 동네 일정에 재고가 없으면 2테이블씩 잡는다(0002 시드와 같은 시연용 가정, 회차·식당 재고에서 바꾼다).
 * 식당 여러 곳을 한 번에: 모집 중 일정·이미 있는 재고를 한 번씩 읽고, 빠진 칸을 한 번에 넣는다. 만든 칸 수, 실패하면 -1
 */
async function ensureInventory(venues: { id: string; region: string }[]) {
  if (!venues.length) return 0;
  const regions = [...new Set(venues.map((v) => v.region))];
  const { data: slots } = await db().from("slots").select("id,region,rounds!inner(status)").in("region", regions).eq("rounds.status", "open");
  if (!slots?.length) return 0;
  // 이미 있는 재고는 건드리지 않는다(같은 식당·일정은 기본 키로 걸러 건너뜀). 실제로 새로 생긴 칸만 센다
  const want = venues.flatMap((v) => slots.filter((s) => s.region === v.region).map((s) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (!want.length) return 0;
  const { data, error } = await db().from("venue_slots").upsert(want, { onConflict: "venue_id,slot_id", ignoreDuplicates: true }).select("venue_id");
  return error ? -1 : (data?.length ?? 0);
}

/**
 * 엑셀로 식당 넣기. 처음 보내면 바꿀 내용을 미리 보여 주고(mode=preview), 운영자가 '이대로 넣기'를 누르면 반영한다(mode=apply).
 * 같은 동네·같은 이름이면 고치고 없으면 새로 만든다. 사용 중인 식당은 모집 중인 일정에 재고가 잡혀 있게 맞춘다.
 */
export async function importVenues(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  const me = await requireAdminWrite("/admin/venues");
  const apply = form.get("mode") === "apply";
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("엑셀 파일을 골라 주세요");
  if (!/\.xlsx$/i.test(file.name)) return fail("양식(.xlsx) 파일만 올릴 수 있어요. 양식을 내려받아 채워 주세요");
  let parsed: Awaited<ReturnType<typeof readVenueWorkbook>>;
  try {
    parsed = await readVenueWorkbook(await file.arrayBuffer());
  } catch {
    return fail("엑셀 파일을 읽지 못했어요. 양식을 내려받아 다시 채워 주세요");
  }
  if (parsed.missing.length) return fail(`첫 줄에 ${parsed.missing.join("·")} 칸이 없어요. 양식 그대로 써 주세요`);
  if (!parsed.rows.length) return fail("채워진 줄이 없어요");
  if (parsed.rows.length > MAX_ROWS) return fail(`한 번에 ${MAX_ROWS}줄까지 올릴 수 있어요. 나눠서 올려 주세요`);

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

  const { data: existing } = await db().from("venues").select("id,name,region,category,address,price_range,rating,review_count,booking_channel,booking_url,phone,map_url,seats_per_table,active");
  const byKey = new Map((existing ?? []).map((v) => [`${v.region}|${v.name}`, v as Record<string, unknown> & { id: string }]));
  const changes: ImportResult["changes"] = [];
  for (const { v } of good) {
    const cur = byKey.get(`${v.region}|${v.name}`);
    if (!cur) { changes.push({ name: v.name, how: "추가", fields: [] }); continue; }
    const fields = Object.keys(FIELD_LABEL).filter((k) => String(cur[k] ?? "") !== String((v as Record<string, unknown>)[k] ?? ""));
    changes.push({ name: v.name, how: "고침", fields: fields.map((k) => FIELD_LABEL[k]) });
  }
  const added = changes.filter((c) => c.how === "추가").length;
  const updated = changes.filter((c) => c.how === "고침").length;
  if (!apply) {
    return {
      ok: good.length > 0, preview: true, added, updated, inventory: 0, skipped, changes,
      message: good.length ? `새로 ${added}곳, 고칠 곳 ${updated}곳${skipped.length ? `, 건너뛸 줄 ${skipped.length}개` : ""}. 확인하고 '이대로 넣기'를 눌러 주세요` : "넣을 수 있는 줄이 없어요",
    };
  }

  // 식당이 많아도 서버 요청 시간 안에 끝나게 묶어서 처리한다: 새 식당은 한 번에 넣고, 고칠 식당은 몇 곳씩 동시에, 감사 로그·재고도 한 번에
  const actor = `admin:${me.id}`;
  const logs: Record<string, unknown>[] = [];
  const saved: { id: string; region: string; active: boolean }[] = [];
  const fresh = good.filter(({ v }) => !byKey.has(`${v.region}|${v.name}`));
  if (fresh.length) {
    const { data: ins, error } = await db().from("venues").insert(fresh.map((g) => g.v)).select("id,region,name,active");
    if (error || !ins) fresh.forEach(({ line }) => skipped.push({ line, why: "저장하지 못했어요" }));
    else for (const r of ins) {
      saved.push(r);
      logs.push({ entity_type: "venue", entity_id: r.id, field: "import", from_value: null, to_value: "추가", actor, reason: `엑셀로 식당 추가: ${r.region} ${r.name} (${file.name})` });
    }
  }
  const edits = good.filter(({ v }) => byKey.has(`${v.region}|${v.name}`));
  for (let i = 0; i < edits.length; i += 8) {
    await Promise.all(edits.slice(i, i + 8).map(async ({ line, v }) => {
      const cur = byKey.get(`${v.region}|${v.name}`)!;
      const { error } = await db().from("venues").update(v).eq("id", cur.id);
      if (error) { skipped.push({ line, why: "저장하지 못했어요" }); return; }
      saved.push({ id: cur.id, region: v.region, active: v.active });
      // 감사 로그: 바뀐 칸마다 이전 값 → 새 값
      const diff = Object.keys(FIELD_LABEL).filter((k) => String(cur[k] ?? "") !== String((v as Record<string, unknown>)[k] ?? ""));
      if (diff.length) logs.push({ entity_type: "venue", entity_id: cur.id, field: "import", from_value: diff.map((k) => `${FIELD_LABEL[k]}=${cur[k] ?? ""}`).join("; "), to_value: diff.map((k) => `${FIELD_LABEL[k]}=${(v as Record<string, unknown>)[k] ?? ""}`).join("; "), actor, reason: `엑셀로 식당 고침: ${v.name} (${file.name})` });
    }));
  }
  if (logs.length) {
    const { error } = await db().from("status_events").insert(logs);
    if (error) skipped.push({ line: 0, why: "식당은 넣었지만 처리 이력을 남기지 못했어요" });
  }
  const done = saved.length;
  const addedNow = saved.filter((v) => !edits.some(({ v: e }) => byKey.get(`${e.region}|${e.name}`)?.id === v.id)).length;
  const updatedNow = done - addedNow;
  const inventory = await ensureInventory(saved.filter((v) => v.active));
  if (inventory < 0) skipped.push({ line: 0, why: "식당은 넣었지만 일정별 재고를 잡지 못했어요. 회차·식당 재고에서 확인해 주세요" });
  revalidatePath("/admin/venues");
  revalidatePath("/admin/rounds");
  return {
    ok: done > 0, preview: false, added: addedNow, updated: updatedNow, inventory: Math.max(inventory, 0), skipped, changes,
    message: `새로 ${addedNow}곳, 고친 곳 ${updatedNow}곳${inventory > 0 ? `, 모집 중인 일정에 재고 ${inventory}칸` : ""}${skipped.length ? `, 건너뛴 줄 ${skipped.length}개` : ""}`,
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

/** 칸 이름(엑셀 제목)으로 폼 값을 모아 엑셀 한 줄과 같은 검사를 쓴다 */
function formToRow(form: FormData) {
  return Object.fromEntries(COLUMNS.map((c) => [c.label, String(form.get(c.key) ?? "")]));
}

/** 식당 한 곳 추가·고치기 (식당 관리 화면의 폼). 엑셀과 같은 기준으로 검사하고, 사용 중이면 모집 중 일정 재고를 맞춘다 */
export async function saveVenue(form: FormData) {
  const me = await requireAdminWrite("/admin/venues");
  const id = String(form.get("id") ?? "");
  const back = id ? `/admin/venues/${id}` : "/admin/venues/new";
  const r = parseVenueRow(formToRow(form));
  if (!r.ok) redirect(`${back}?e=${encodeURIComponent(r.errors.join(" · "))}`);
  const v = r.value;
  const { data: same } = await db().from("venues").select("id").eq("region", v.region).eq("name", v.name).neq("id", id || "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (same) redirect(`${back}?e=${encodeURIComponent(`${v.region}에 '${v.name}'이(가) 이미 있어요`)}`);
  const actor = `admin:${me.id}`;
  let venueId = id;
  if (id) {
    const { data: cur } = await db().from("venues").select("id,name,region,category,address,price_range,rating,review_count,booking_channel,booking_url,phone,map_url,seats_per_table,active").eq("id", id).maybeSingle();
    if (!cur) redirect(`/admin/venues?e=${encodeURIComponent("식당을 찾지 못했어요")}`);
    const keys = ["name", "region", ...Object.keys(FIELD_LABEL)] as const;
    const label = (k: string) => (k === "name" ? "이름" : k === "region" ? "동네" : FIELD_LABEL[k]);
    const diff = keys.filter((k) => String((cur as Record<string, unknown>)[k] ?? "") !== String((v as Record<string, unknown>)[k] ?? ""));
    if (!diff.length) redirect(`${back}?m=${encodeURIComponent("바뀐 칸이 없어요")}`);
    const { error } = await db().from("venues").update(v).eq("id", id);
    if (error) redirect(`${back}?e=${encodeURIComponent("저장하지 못했어요. 다시 눌러 주세요")}`);
    await logStatus({ entityType: "venue", entityId: id, field: "edit", from: diff.map((k) => `${label(k)}=${(cur as Record<string, unknown>)[k] ?? ""}`).join("; "), to: diff.map((k) => `${label(k)}=${(v as Record<string, unknown>)[k] ?? ""}`).join("; "), actor, reason: `식당 고침: ${v.name}` });
  } else {
    const { data: ins, error } = await db().from("venues").insert(v).select("id").single();
    if (error || !ins) redirect(`${back}?e=${encodeURIComponent("저장하지 못했어요. 다시 눌러 주세요")}`);
    venueId = ins.id;
    await logStatus({ entityType: "venue", entityId: venueId, field: "status", to: "created", actor, reason: `식당 추가: ${v.region} ${v.name}` });
  }
  const n = v.active ? await ensureInventory([{ id: venueId, region: v.region }]) : 0;
  revalidatePath("/admin/venues");
  revalidatePath("/admin/rounds");
  redirect(`/admin/venues/${venueId}?m=${encodeURIComponent(`${id ? "고쳤어요" : `${v.name}을(를) 추가했어요`}${n > 0 ? `. 모집 중인 일정 ${n}곳에 2테이블씩 잡았어요` : ""}${n < 0 ? ". 일정별 재고는 회차·식당 재고에서 확인해 주세요" : ""}`)}`);
}

/** 배정 켜기·끄기. 끈 식당은 새 테이블에 배정하지 않는다(이미 배정된 테이블은 그대로) */
export async function toggleVenue(form: FormData) {
  const me = await requireAdminWrite("/admin/venues");
  const id = String(form.get("id") ?? "");
  const { data: cur } = await db().from("venues").select("id,name,region,active").eq("id", id).maybeSingle();
  if (!cur) redirect(`/admin/venues?e=${encodeURIComponent("식당을 찾지 못했어요")}`);
  const next = !cur.active;
  await db().from("venues").update({ active: next }).eq("id", id);
  await logStatus({ entityType: "venue", entityId: id, field: "active", from: String(cur.active), to: String(next), actor: `admin:${me.id}`, reason: `식당 ${next ? "배정 다시 켬" : "배정 끔"}: ${cur.name}` });
  const n = next ? await ensureInventory([{ id, region: cur.region }]) : 0;
  revalidatePath("/admin/venues");
  revalidatePath("/admin/rounds");
  const to = String(form.get("back") ?? "") === "list" ? "/admin/venues" : `/admin/venues/${id}`;
  redirect(`${to}?m=${encodeURIComponent(`${cur.name}: ${next ? `다시 배정해요${n > 0 ? ` (모집 중인 일정 ${n}곳에 재고 잡음)` : ""}` : "이제 새 테이블에 배정하지 않아요. 이미 배정된 모임은 그대로예요"}`)}`);
}
