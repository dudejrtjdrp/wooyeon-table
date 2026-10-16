import type { MetricsInput } from "@/lib/metrics";
import { db } from "@/lib/supabase";

// Supabase는 한 번에 1000행까지 돌려준다. 지표는 전체를 세야 하므로 나눠 읽는다
async function all<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data } = await make(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** 지표 계산에 쓰는 데이터를 읽는다. 시연용 테스트 참가자도 함께 센다(데모에서 숫자가 움직이는 걸 보이려고) */
export async function loadMetricsInput(): Promise<MetricsInput> {
  const [apps, tables, exceptions, adminEvents, failEvents, feedbacks, rounds, rooms] = await Promise.all([
    all<MetricsInput["apps"][number]>((a, b) => db().from("applications").select("id,user_id,round_id,application_status,payment_status,match_status,attendance_status,realloc_count,resolution,submitted_at").order("id").range(a, b)),
    all<{ id: string; round_id: string; confirmed_at: string | null; explanation: { origin?: string } | null }>((a, b) => db().from("dining_tables").select("id,round_id,confirmed_at,explanation").order("id").range(a, b)),
    all<{ id: string; kind: string; status: string; created_at: string; resolved_at: string | null; resolved_by: string | null; ref_type: string; ref_id: string }>((a, b) => db().from("exceptions").select("id,kind,status,created_at,resolved_at,resolved_by,ref_type,ref_id").order("id").range(a, b)),
    all<MetricsInput["events"][number]>((a, b) => db().from("status_events").select("entity_type,entity_id,field,to_value,actor,match_run_id").like("actor", "admin:%").order("id").range(a, b)),
    all<MetricsInput["events"][number]>((a, b) => db().from("status_events").select("entity_type,entity_id,field,to_value,actor,match_run_id").eq("field", "match_status").eq("to_value", "ALTERNATIVE_OFFERED").not("match_run_id", "is", null).order("id").range(a, b)),
    all<{ application_id: string }>((a, b) => db().from("feedbacks").select("application_id").order("application_id").range(a, b)),
    all<{ id: string; match_at: string }>((a, b) => db().from("rounds").select("id,match_at").order("id").range(a, b)),
    all<{ id: string; table_id: string }>((a, b) => db().from("chat_rooms").select("id,table_id").order("id").range(a, b)),
  ]);

  // 예외가 어느 회차 것인지: 신청·테이블·단체방으로 찾는다. 사람 단위(노쇼 반복 등)·알림 단위 예외는 회차를 모른다
  const appRound = new Map(apps.map((a) => [a.id, a.round_id]));
  const tableRound = new Map(tables.map((t) => [t.id, t.round_id]));
  const roomTable = new Map(rooms.map((r) => [r.id, r.table_id]));
  const roundOf = (refType: string, refId: string) => {
    if (refType === "application") return appRound.get(refId) ?? null;
    if (refType === "dining_table") return tableRound.get(refId) ?? null;
    if (refType === "chat_room") return tableRound.get(roomTable.get(refId) ?? "") ?? null;
    return null;
  };

  return {
    apps,
    tables: tables.map((t) => ({ id: t.id, round_id: t.round_id, confirmed_at: t.confirmed_at, origin: t.explanation?.origin ?? null })),
    exceptions: exceptions.map((e) => ({ id: e.id, kind: e.kind, status: e.status, created_at: e.created_at, resolved_at: e.resolved_at, resolved_by: e.resolved_by, round_id: roundOf(e.ref_type, e.ref_id) })),
    events: [...adminEvents, ...failEvents],
    feedbackAppIds: feedbacks.map((f) => f.application_id),
    rounds,
  };
}
