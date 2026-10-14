import { db } from "./supabase";

// 모든 상태 변경은 status_events에 한 줄씩 남긴다 (docs/01-state-flow.md 7장)
export async function logStatus(e: {
  entityType: string;
  entityId: string;
  field: string;
  from?: string | null;
  to: string;
  actor: string;
  reason?: string;
  matchRunId?: string;
}) {
  await db().from("status_events").insert({
    entity_type: e.entityType,
    entity_id: e.entityId,
    field: e.field,
    from_value: e.from ?? null,
    to_value: e.to,
    actor: e.actor,
    reason: e.reason ?? null,
    match_run_id: e.matchRunId ?? null,
  });
}
