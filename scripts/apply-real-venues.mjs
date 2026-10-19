// 실제 식당 24곳(data/real-venues.json)을 DB에 넣는다. 여러 번 돌려도 결과가 같다(멱등).
// - 이미 같은 동네·같은 이름이 있으면 정보만 맞춘다(배정 켜짐/꺼짐은 그대로)
// - 없으면 새로 넣는다. 가상 식당은 고쳐 쓰지 않고 배정만 끈다(지난 테이블·공지·예약 기록이 그때 식당 그대로 남게)
// - 앞으로 열릴 일정(지금 이후 시작, 모집 중 회차)에는 새로 들어온 식당 재고를 2테이블씩 잡는다
// 사진은 AI로 만든 분위기 사진(public/venues/ai-*.jpg)이다. 실제 매장 사진이 아니라는 표시는 화면이 photo_url로 판단한다
// 쓰는 법: node --env-file=.env.local scripts/apply-real-venues.mjs [--dry]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const dry = process.argv.includes("--dry");
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 필요해요");
const db = createClient(url, key, { auth: { persistSession: false } });
const real = JSON.parse(readFileSync(new URL("../data/real-venues.json", import.meta.url), "utf8"));

const row = (v) => ({
  name: v.name, region: v.region, address: v.address, category: v.category, price_range: v.price_range,
  seats_per_table: v.seats_per_table ?? 4, rating: v.rating, review_count: v.review_count,
  booking_channel: v.booking_channel, booking_url: v.booking_url, phone: v.phone, map_url: v.map_url,
  photo_url: v.photo,
});
// 이력: 누가 언제 어떤 식당을 무엇으로 바꿨는지 남긴다(변경 이력 화면에 보인다)
const ACTOR = "system:real-venues";
const logEv = (entity_id, field, from_value, to_value, reason) =>
  dry ? null : db.from("status_events").insert({ entity_type: "venue", entity_id, field, from_value, to_value, actor: ACTOR, reason });

const { data: venues, error } = await db.from("venues").select("id,name,region,active");
if (error) throw error;
const realKey = new Set(real.map((v) => `${v.region}|${v.name}`));
const log = [];
const touched = [];

for (const region of [...new Set(real.map((v) => v.region))]) {
  for (const v of real.filter((x) => x.region === region)) {
    const same = venues.find((x) => x.region === region && x.name === v.name);
    if (same) {
      log.push(`맞춤  ${region} ${v.name}`);
      if (!dry) { const { error: e } = await db.from("venues").update(row(v)).eq("id", same.id); if (e) throw e; } // 배정 켜짐/꺼짐은 운영자가 정한 그대로
      touched.push(same.id);
      continue;
    }
    log.push(`추가  ${region} ${v.name}`);
    if (!dry) { const { data, error: e } = await db.from("venues").insert({ ...row(v), active: true }).select("id").single(); if (e) throw e; touched.push(data.id); await logEv(data.id, "status", null, "active", "실제 식당 추가"); }
  }
  // 실제 목록에 없는 식당(시연용 가상 식당)은 지우지도 고쳐 쓰지도 않고 배정만 끈다. 지난 테이블·공지는 그때 식당 이름 그대로 남는다
  for (const f of venues.filter((x) => x.region === region && !realKey.has(`${x.region}|${x.name}`) && x.active)) {
    log.push(`끄기  ${region} ${f.name}`);
    if (!dry) { await db.from("venues").update({ active: false }).eq("id", f.id); await logEv(f.id, "active", "true", "false", "실제 식당으로 바꾸면서 가상 식당 배정 끄기"); }
  }
}

// 운영 동네(서울 네 곳) 밖의 가상 식당도 배정을 끈다 (지난 기록은 그대로 남는다)
const regions = new Set(real.map((v) => v.region));
for (const v of venues.filter((x) => !regions.has(x.region) && x.active)) {
  log.push(`끄기  ${v.region} ${v.name} (운영 동네 밖)`);
  if (!dry) { await db.from("venues").update({ active: false }).eq("id", v.id); await logEv(v.id, "active", "true", "false", "운영 동네 밖 가상 식당 배정 끄기"); }
}

// 앞으로의 모집 중 회차 일정에 재고 잡기 (이미 있으면 그대로)
if (!dry && touched.length) {
  const { data: slots } = await db.from("slots").select("id,region,rounds!inner(status)").gte("starts_at", new Date().toISOString()).eq("rounds.status", "open");
  const { data: vs } = await db.from("venues").select("id,region").in("id", touched);
  const { data: have } = await db.from("venue_slots").select("venue_id,slot_id").in("venue_id", touched);
  const got = new Set((have ?? []).map((h) => `${h.venue_id}|${h.slot_id}`));
  const add = (slots ?? []).flatMap((s) => (vs ?? []).filter((v) => v.region === s.region && !got.has(`${v.id}|${s.id}`)).map((v) => ({ venue_id: v.id, slot_id: s.id, tables_available: 2 })));
  if (add.length) { const { error: e } = await db.from("venue_slots").insert(add); if (e) throw e; }
  log.push(`재고  새로 ${add.length}칸`);
}
console.log(log.join("\n"));
console.log(dry ? "(미리 보기만 했어요)" : "끝났어요");
