// 단체방 나가기 (성효님 결정 2026-10-21: 모임이 끝나도 단체방은 닫지 않고 남겨 두되, 원하면 나갈 수 있게).
// 나간 기록은 status_events(application · chat · LEFT)에 남긴다. 모임 전·당일에는 나갈 수 없다(당일 취소·단체방 나가기 불가 규칙)
import { db } from "./supabase";

/** 이 테이블 단체방에서 나간 사람(user_id) */
export async function leftUsers(appIds: { id: string; user_id: string }[]): Promise<Set<string>> {
  if (!appIds.length) return new Set();
  const { data } = await db().from("status_events").select("entity_id").eq("entity_type", "application").eq("field", "chat").eq("to_value", "LEFT").in("entity_id", appIds.map((a) => a.id));
  const ids = new Set((data ?? []).map((x) => String(x.entity_id)));
  return new Set(appIds.filter((a) => ids.has(a.id)).map((a) => a.user_id));
}

/** 나갈 수 있는지: 모임이 끝난 뒤에만 */
export const canLeaveChat = (ended: boolean) => ended;
