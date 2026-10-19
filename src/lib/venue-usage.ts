import { db } from "./supabase";
import type { VenueUsage } from "./venue-list-rules";

/** 식당이 쓰인 기록 수: 배정된 테이블(해산된 것 포함), 예약 기록, 일정별 재고. 지울 수 있는지는 canDeleteVenue가 본다 */
export async function venueUsage(id: string): Promise<VenueUsage> {
  const head = { count: "exact" as const, head: true };
  const [t, r, s] = await Promise.all([
    db().from("dining_tables").select("id", head).eq("venue_id", id),
    db().from("reservations").select("id", head).eq("venue_id", id),
    db().from("venue_slots").select("slot_id", head).eq("venue_id", id),
  ]);
  // 조회가 실패하면 '안 쓰임'으로 보지 않는다(지우면 안 되는 식당을 지우지 않게)
  if (t.error || r.error || s.error) throw new Error("식당 사용 기록을 확인하지 못했어요");
  return { tables: t.count ?? 0, reservations: r.count ?? 0, stock: s.count ?? 0 };
}
