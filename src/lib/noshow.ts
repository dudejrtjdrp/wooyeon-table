// 노쇼 단계 제한 (성효님 결정 2026-10-16, 운영사 Q&A: 기준은 직접 정함)
// 운영자가 노쇼를 확정하면 최근 90일 노쇼 횟수로 단계를 정한다.
//  1회: 경고 알림 (1회권은 환불 없음, 멤버십은 그 회차를 쓴 것으로 보고 기간을 늘리지 않음)
//  2회: 30일 동안 신청 제한 (자동)
//  3회 이상: 영구 제한을 운영자가 검토 (예외 처리함)
import { logStatus } from "./events";
import { quietly, syncScheduled } from "./scheduled";
import { fmtDay, fmtSlot } from "./format";
import { notify } from "./notify";
import { db } from "./supabase";

export const NOSHOW_WINDOW_DAYS = 90;
export const RESTRICT_DAYS = 30;

/**
 * 최근 기간 노쇼 횟수. 기간 안에 NO_SHOW로 바뀐 기록 중 지금도 노쇼인 신청만 센다
 * (운영자가 '참석 예정으로 되돌린' 노쇼는 빼고, 되돌렸다 다시 노쇼가 된 신청도 한 번). 이번 신청은 늘 넣는다.
 */
export function countNoShows(events: { entity_id: string }[], stillNoShow: string[], current: string): number {
  const live = new Set(stillNoShow);
  return new Set([...events.map((e) => e.entity_id).filter((id) => live.has(id)), current]).size;
}

export type NoShowStep = "warn" | "restrict" | "review";
export function noShowStep(count: number): NoShowStep {
  if (count >= 3) return "review";
  if (count === 2) return "restrict";
  return "warn";
}

/** 노쇼가 확정된 뒤 부른다. 몇 번째인지 세고 단계에 맞게 처리한다 */
export async function applyNoShowPolicy(userId: string, appId: string, actor: string, at = new Date()): Promise<NoShowStep> {
  const since = new Date(at.getTime() - NOSHOW_WINDOW_DAYS * 86400_000).toISOString();
  // 운영자가 '참석 예정으로 되돌린' 노쇼는 세지 않는다: 지금도 노쇼인 신청만 (참석 관리의 실수 정정)
  const stillNoShow = ((await db().from("applications").select("id").eq("user_id", userId).eq("attendance_status", "NO_SHOW")).data ?? []).map((a) => a.id);
  const { data } = await db()
    .from("status_events")
    .select("entity_id")
    .eq("entity_type", "application")
    .eq("field", "attendance_status")
    .eq("to_value", "NO_SHOW")
    .gte("created_at", since)
    .in("entity_id", stillNoShow.length ? stillNoShow : [appId]);
  const count = countNoShows(data ?? [], stillNoShow, appId);
  const step = noShowStep(count);
  // 후기 다시 요청처럼 참석을 전제로 한 예약 알림은 거둔다
  await quietly(syncScheduled([appId], actor, "노쇼 확정"));
  if (step === "warn") {
    await db().from("users").update({ account_status: "warned" }).eq("id", userId).eq("account_status", "active");
    await logStatus({ entityType: "user", entityId: userId, field: "account_status", to: "warned", actor, reason: `노쇼 ${count}회(최근 ${NOSHOW_WINDOW_DAYS}일): 경고` });
    await notify({ userId, template: "noshow_warn", title: "지난 모임에 오지 않으셨어요", body: `${NOSHOW_WINDOW_DAYS}일 안에 한 번 더 이러면 ${RESTRICT_DAYS}일 동안 신청이 막혀요`, link: "/help", dedupeKey: `noshow:${appId}` });
  } else if (step === "restrict") {
    const until = new Date(at.getTime() + RESTRICT_DAYS * 86400_000).toISOString();
    await db().from("users").update({ account_status: "restricted", restricted_until: until }).eq("id", userId).neq("account_status", "banned");
    await logStatus({ entityType: "user", entityId: userId, field: "account_status", to: "restricted", actor, reason: `노쇼 ${count}회(최근 ${NOSHOW_WINDOW_DAYS}일): ${RESTRICT_DAYS}일 신청 제한` });
    await notify({ userId, template: "noshow_restrict", title: `${RESTRICT_DAYS}일 동안 신청이 막혔어요`, body: `${fmtDay(until)}부터 다시 신청할 수 있어요`, link: "/help", dedupeKey: `noshow:${appId}` });
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
