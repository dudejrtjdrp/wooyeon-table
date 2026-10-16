// 식당 예약 (운영사 Q&A: 식당은 평점 좋고 예약 가능한 곳. 성효님 결정: 네이버 예약·캐치테이블 연동 구조까지)
//
// 테이블이 확정되고 식당이 정해지면 예약 요청을 만들고, 식당의 예약 채널 어댑터로 보낸다.
// 네이버 예약·캐치테이블은 누구나 쓰는 공개 예약 API가 없어(제휴·POS 연동 방식) 지금은 모의(mock) 어댑터가 응답한다.
// 제휴 키가 생기면 해당 채널의 live 어댑터만 채우면 되고, 나머지 흐름(재시도·예외·화면)은 그대로 쓴다.
// 3번 실패하면(전화 예약 식당은 자동으로 못 해서 바로) 그 식당을 빼고 같은 지역·일정의 다른 식당으로 다시 배정한다(pipeline.ts reassignVenue).
// 후보 식당이 모두 안 될 때만 예외 큐(reservation)로 넘기고, 운영자는 예약 페이지를 열어 직접 예약한 뒤 '예약 완료'로 표시한다.
import { now } from "./clock";
import { logStatus } from "./events";
import { fmtSlot } from "./format";
import { db } from "./supabase";
import { GOOD_RATING as RATING } from "./venue-pick";

export type Channel = "naver" | "catchtable" | "phone";
export const CHANNEL_LABEL: Record<Channel, string> = { naver: "네이버 예약", catchtable: "캐치테이블", phone: "전화 예약" };
export const MAX_ATTEMPTS = 3;
/** 배정할 때 먼저 고르는 평점 (venue-pick.ts와 같은 값) */
export const GOOD_RATING = RATING;

export type ReservationRequest = { channel: Channel; venueName: string; venueAddress: string; bookingUrl: string | null; reservedFor: string; partySize: number; name: string };
export type BookResult = { ok: true; externalRef: string } | { ok: false; error: string };
export interface BookingAdapter {
  mode: "mock" | "live";
  book(req: ReservationRequest): Promise<BookResult>;
}

/** 예약 페이지 링크. 식당에 등록된 예약 주소가 있으면 그걸, 없으면 채널에서 식당을 찾는 주소 */
export function deepLink(channel: Channel, name: string, address: string, bookingUrl: string | null): string | null {
  if (bookingUrl) return bookingUrl;
  const q = encodeURIComponent(`${name} ${address.replace(/\(.*\)/, "").trim()}`);
  if (channel === "naver") return `https://map.naver.com/p/search/${q}`;
  if (channel === "catchtable") return `https://app.catchtable.co.kr/ct/search/total?keyword=${encodeURIComponent(name)}`;
  return null;
}

/** 모의 어댑터: 실제로 예약하지 않고 예약번호를 만들어 돌려준다. 식당 이름에 '[예약실패]'가 있으면 실패를 흉내 낸다(시연용) */
function mockAdapter(prefix: string): BookingAdapter {
  return {
    mode: "mock",
    async book(req) {
      if (req.venueName.includes("[예약실패]")) return { ok: false, error: `${prefix} 응답: 해당 시간 예약 불가(모의)` };
      const code = Math.abs([...`${req.venueName}${req.reservedFor}${req.name}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 1_000_000;
      return { ok: true, externalRef: `${prefix}-${String(code).padStart(6, "0")}` };
    },
  };
}

/** 채널별 어댑터. 제휴 키(NAVER_BOOKING_KEY, CATCHTABLE_KEY)가 생기면 live 어댑터로 바꾼다 */
export function adapterFor(channel: Channel): BookingAdapter {
  if (channel === "naver") return mockAdapter("NV");
  if (channel === "catchtable") return mockAdapter("CT");
  // 전화 예약은 자동으로 할 수 없어 바로 운영자 몫이다
  return { mode: "mock", book: async () => ({ ok: false, error: "전화 예약 식당이라 운영팀이 직접 예약해야 해요" }) };
}

type Row = { id: string; table_id: string; venue_id: string; status: string; attempts: number; channel: Channel; party_size: number; reserved_for: string; reservation_name: string };

/** 식당이 정해진 테이블에 예약 요청을 만들고 한 번 시도한다 (두 번 불러도 한 건만) */
export async function requestReservation(tableId: string): Promise<void> {
  const { data } = await db()
    .from("dining_tables")
    .select("id,reservation_name,venue_id,slots(starts_at),venues(id,name,address,booking_channel,booking_url)")
    .eq("id", tableId)
    .maybeSingle();
  const t = data as unknown as { id: string; reservation_name: string | null; venue_id: string | null; slots: { starts_at: string }; venues: { id: string; name: string; address: string; booking_channel: Channel | null; booking_url: string | null } | null } | null;
  if (!t?.venues) return;
  const { count } = await db().from("applications").select("id", { count: "exact", head: true }).eq("table_id", tableId).eq("match_status", "CONFIRMED");
  const channel = t.venues.booking_channel ?? "phone";
  const { data: row } = await db()
    .from("reservations")
    .upsert(
      {
        table_id: tableId,
        venue_id: t.venues.id,
        channel,
        party_size: count ?? 0,
        reserved_for: t.slots.starts_at,
        reservation_name: t.reservation_name ?? `우연한식탁 ${tableId.slice(0, 4).toUpperCase()}`,
        deep_link: deepLink(channel, t.venues.name, t.venues.address, t.venues.booking_url),
      },
      { onConflict: "table_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (row) await logStatus({ entityType: "reservation", entityId: row.id, field: "status", to: "REQUESTED", actor: "system", reason: `${CHANNEL_LABEL[channel]} 예약 요청 (${count ?? 0}명)` });
  await attemptReservation(tableId);
}

/**
 * 한 번 시도한다. 성공하면 CONFIRMED.
 * 실패가 3번 쌓이면(전화 예약은 바로) FAILED로 두고 다른 식당으로 바꿔 다시 시도한다. 바꿀 식당이 없을 때만 예외 큐.
 */
export async function attemptReservation(tableId: string, adapter?: BookingAdapter): Promise<string> {
  const { data } = await db()
    .from("reservations")
    .select("id,table_id,venue_id,status,attempts,channel,party_size,reserved_for,reservation_name,venues(name,address,booking_url)")
    .eq("table_id", tableId)
    .maybeSingle();
  const r = data as unknown as (Row & { venues: { name: string; address: string; booking_url: string | null } }) | null;
  if (!r || r.status !== "REQUESTED") return r?.status ?? "NONE";
  const a = adapter ?? adapterFor(r.channel);
  const res = await a.book({ channel: r.channel, venueName: r.venues.name, venueAddress: r.venues.address, bookingUrl: r.venues.booking_url, reservedFor: r.reserved_for, partySize: r.party_size, name: r.reservation_name });
  const attempts = r.attempts + 1;
  if (res.ok) {
    await db().from("reservations").update({ status: "CONFIRMED", attempts, external_ref: res.externalRef, mode: a.mode, last_error: null, updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "REQUESTED");
    await logStatus({ entityType: "reservation", entityId: r.id, field: "status", from: "REQUESTED", to: "CONFIRMED", actor: "system", reason: `${CHANNEL_LABEL[r.channel]} 예약 확정 ${res.externalRef}${a.mode === "mock" ? " (모의)" : ""}` });
    return "CONFIRMED";
  }
  // 전화 예약은 다시 시도해도 결과가 같아서 바로 다음 식당으로 넘어간다
  const failed = attempts >= MAX_ATTEMPTS || r.channel === "phone";
  await db().from("reservations").update({ status: failed ? "FAILED" : "REQUESTED", attempts, last_error: res.error, updated_at: new Date().toISOString() }).eq("id", r.id);
  await logStatus({ entityType: "reservation", entityId: r.id, field: "attempt", from: String(r.attempts), to: String(attempts), actor: "system", reason: res.error });
  if (failed) {
    await logStatus({ entityType: "reservation", entityId: r.id, field: "status", from: "REQUESTED", to: "FAILED", actor: "system", reason: r.channel === "phone" ? "전화 예약 식당이라 자동 예약 불가" : `${MAX_ATTEMPTS}번 실패` });
    // 같은 지역·일정의 다른 식당으로 (PRD 15장). 바꿨으면 새 식당의 예약 결과를 돌려준다
    const { reassignVenue } = await import("./pipeline");
    const next = await reassignVenue(tableId, r.venue_id, `${r.venues.name} ${CHANNEL_LABEL[r.channel]} 예약 안 됨: ${res.error}`).catch((e) => {
      console.error("[reservations] 다른 식당 배정 실패", tableId, e);
      return null;
    });
    if (next) return next;
    const { count: tried } = await db().from("status_events").select("id", { count: "exact", head: true }).eq("entity_type", "dining_table").eq("entity_id", tableId).eq("field", "venue_failed");
    await db().from("exceptions").upsert(
      { kind: "reservation", ref_type: "dining_table", ref_id: tableId, reason: `${fmtSlot(r.reserved_for)} ${r.party_size}명 예약을 후보 식당 ${tried ?? 1}곳에서 모두 못 잡았어요. 마지막 식당 ${r.venues.name}: ${res.error}`, dedupe_key: `reservation:${tableId}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }
  return failed ? "FAILED" : "REQUESTED";
}

/** tick에서 부른다: 실패해서 다시 기다리는 예약을 10분 간격으로 다시 시도 */
export async function retryReservations(): Promise<number> {
  const t = await now();
  const { data } = await db().from("reservations").select("table_id,attempts").eq("status", "REQUESTED").gt("attempts", 0).lt("updated_at", new Date(t.getTime() - 10 * 60_000).toISOString()).limit(50);
  for (const r of data ?? []) await attemptReservation(r.table_id);
  return data?.length ?? 0;
}

/** 운영자가 직접 예약했을 때 */
export async function markReservedManually(tableId: string, ref: string, adminId: string) {
  const { data } = await db().from("reservations").select("id,status").eq("table_id", tableId).maybeSingle();
  if (!data) return;
  await db().from("reservations").update({ status: "CONFIRMED", mode: "manual", external_ref: ref || null, updated_at: new Date().toISOString() }).eq("id", data.id);
  await logStatus({ entityType: "reservation", entityId: data.id, field: "status", from: data.status, to: "CONFIRMED", actor: `admin:${adminId}`, reason: `운영자가 직접 예약${ref ? ` (${ref})` : ""}` });
  await db().from("exceptions").update({ status: "resolved", resolution: "운영자가 직접 예약", resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("dedupe_key", `reservation:${tableId}`).eq("status", "open");
}

/** 운영자가 다시 시도 (실패 횟수를 초기화) */
export async function resetAndRetry(tableId: string, adminId: string) {
  const { data } = await db().from("reservations").select("id,status").eq("table_id", tableId).maybeSingle();
  if (!data) return requestReservation(tableId);
  await db().from("reservations").update({ status: "REQUESTED", attempts: 0, last_error: null }).eq("id", data.id);
  await logStatus({ entityType: "reservation", entityId: data.id, field: "status", from: data.status, to: "REQUESTED", actor: `admin:${adminId}`, reason: "운영자가 다시 시도" });
  const st = await attemptReservation(tableId);
  // 성공했으면 열려 있던 예약 실패 예외도 닫는다
  if (st === "CONFIRMED") await db().from("exceptions").update({ status: "resolved", resolution: "예약 다시 시도 성공", resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("dedupe_key", `reservation:${tableId}`).eq("status", "open");
}
