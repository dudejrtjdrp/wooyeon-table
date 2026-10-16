// 노쇼 단계 제한 (성효님 결정 2026-10-16, 운영사 Q&A: 기준은 직접 정함)
// 운영자가 노쇼를 확정하면 최근 90일 노쇼 횟수로 단계를 정한다.
//  1회: 경고 알림 (1회권은 환불 없음, 멤버십은 그 회차를 쓴 것으로 보고 기간을 늘리지 않음)
//  2회: 30일 동안 신청 제한 (자동)
//  3회 이상: 영구 제한을 운영자가 검토 (예외 처리함)
import { logStatus } from "./events";
import { fmtDay, fmtSlot } from "./format";
import { notify } from "./notify";
import { db } from "./supabase";

export const NOSHOW_WINDOW_DAYS = 90;
export const RESTRICT_DAYS = 30;

export type NoShowStep = "warn" | "restrict" | "review";
export function noShowStep(count: number): NoShowStep {
  if (count >= 3) return "review";
  if (count === 2) return "restrict";
  return "warn";
}

/** 노쇼가 확정된 뒤 부른다. 몇 번째인지 세고 단계에 맞게 처리한다 */
export async function applyNoShowPolicy(userId: string, appId: string, actor: string, at = new Date()): Promise<NoShowStep> {
  const since = new Date(at.getTime() - NOSHOW_WINDOW_DAYS * 86400_000).toISOString();
  const { data } = await db()
    .from("status_events")
    .select("entity_id")
    .eq("entity_type", "application")
    .eq("field", "attendance_status")
    .eq("to_value", "NO_SHOW")
    .gte("created_at", since)
    .in("entity_id", (await db().from("applications").select("id").eq("user_id", userId)).data?.map((a) => a.id) ?? [appId]);
  const count = new Set([...(data ?? []).map((e) => e.entity_id), appId]).size;
  const step = noShowStep(count);
  if (step === "warn") {
    await db().from("users").update({ account_status: "warned" }).eq("id", userId).eq("account_status", "active");
    await logStatus({ entityType: "user", entityId: userId, field: "account_status", to: "warned", actor, reason: `노쇼 ${count}회(최근 ${NOSHOW_WINDOW_DAYS}일): 경고` });
    await notify({ userId, template: "noshow_warn", title: "지난 모임에 오지 않으셨어요", body: `연락 없이 오지 않으면 테이블의 다른 분들이 기다리게 돼요. ${NOSHOW_WINDOW_DAYS}일 안에 한 번 더 이러면 ${RESTRICT_DAYS}일 동안 신청이 막혀요. 사정이 있었다면 문의로 알려 주세요.`, link: "/help", dedupeKey: `noshow:${appId}` });
  } else if (step === "restrict") {
    const until = new Date(at.getTime() + RESTRICT_DAYS * 86400_000).toISOString();
    await db().from("users").update({ account_status: "restricted", restricted_until: until }).eq("id", userId).neq("account_status", "banned");
    await logStatus({ entityType: "user", entityId: userId, field: "account_status", to: "restricted", actor, reason: `노쇼 ${count}회(최근 ${NOSHOW_WINDOW_DAYS}일): ${RESTRICT_DAYS}일 신청 제한` });
    await notify({ userId, template: "noshow_restrict", title: `${RESTRICT_DAYS}일 동안 신청이 막혔어요`, body: `최근 ${NOSHOW_WINDOW_DAYS}일 안에 두 번 연락 없이 오지 않으셨어요. ${fmtDay(until)}부터 다시 신청할 수 있어요.`, link: "/help", dedupeKey: `noshow:${appId}` });
  } else {
    await db().from("exceptions").upsert(
      { kind: "no_show", ref_type: "user", ref_id: userId, reason: `최근 ${NOSHOW_WINDOW_DAYS}일 노쇼 ${count}회: 영구 제한을 검토해 주세요`, dedupe_key: `noshow-review:${userId}:${count}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    await db().from("users").update({ account_status: "restricted", restricted_until: null }).eq("id", userId).neq("account_status", "banned");
    await logStatus({ entityType: "user", entityId: userId, field: "account_status", to: "restricted", actor, reason: `노쇼 ${count}회: 운영자 검토 전까지 신청 제한` });
  }
  return step;
}

/** 신청을 막아야 하는지. 막으면 이유 문장, 아니면 null. 기한이 지난 제한은 풀어 준다 */
export async function applyBlock(userId: string, at = new Date()): Promise<string | null> {
  const { data: u } = await db().from("users").select("account_status,restricted_until").eq("id", userId).maybeSingle();
  if (!u) return null;
  if (u.account_status === "banned") return "이용이 제한된 계정이에요. 문의로 연락 주세요";
  if (u.account_status === "restricted") {
    if (u.restricted_until && new Date(u.restricted_until) <= at) {
      await db().from("users").update({ account_status: "warned", restricted_until: null }).eq("id", userId);
      await logStatus({ entityType: "user", entityId: userId, field: "account_status", from: "restricted", to: "warned", actor: "system", reason: "신청 제한 기한이 지나 해제" });
      return null;
    }
    if (u.restricted_until) {
      return `${fmtSlot(u.restricted_until)}까지 신청이 막혀 있어요`;
    }
    return "운영팀 확인 전까지 신청이 막혀 있어요. 문의로 연락 주세요";
  }
  return null;
}
