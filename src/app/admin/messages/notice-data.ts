// 운영자 공지의 받는 사람 읽기. 화면(미리 보기)과 보내기 액션이 같은 함수를 써서 수가 어긋나지 않게 한다
import { fmtSlot } from "@/lib/format";
import { type NoticeRow, type NoticeScope, noticeRecipients } from "@/lib/notice-rules";
import { db } from "@/lib/supabase";

export type NoticeTarget = { ok: true; label: string; userIds: string[]; names: string[] } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AppRow = { user_id: string; application_status: string; match_status: string; attendance_status: string | null; users: { name: string; deleted_at: string | null } | null };
const APP_COLS = "user_id,application_status,match_status,attendance_status,users(name,deleted_at)";

function fromApps(scope: NoticeScope, label: string, apps: AppRow[]): NoticeTarget {
  const rows: NoticeRow[] = apps.map((a) => ({ ...a, deleted_at: a.users?.deleted_at ?? null }));
  const userIds = noticeRecipients(scope, rows);
  const name = new Map(apps.map((a) => [a.user_id, a.users?.name ?? ""]));
  return { ok: true, label, userIds, names: userIds.map((id) => name.get(id) ?? "") };
}

export async function loadNoticeTarget(scope: NoticeScope, targetId: string): Promise<NoticeTarget> {
  if (!UUID.test(targetId)) return { ok: false, message: "받을 대상을 골라 주세요" };
  if (scope === "round") {
    const { data: r } = await db().from("rounds").select("id,title").eq("id", targetId).maybeSingle();
    if (!r) return { ok: false, message: "회차를 찾지 못했어요" };
    const { data } = await db().from("applications").select(APP_COLS).eq("round_id", targetId).limit(2000);
    return fromApps("round", `${r.title} 신청자`, (data ?? []) as unknown as AppRow[]);
  }
  if (scope === "table") {
    const { data: t } = await db().from("dining_tables").select("id,slots(starts_at,region),venues(name)").eq("id", targetId).maybeSingle();
    const tb = t as unknown as { id: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null } | null;
    if (!tb) return { ok: false, message: "테이블을 찾지 못했어요" };
    const { data } = await db().from("applications").select(APP_COLS).eq("table_id", targetId);
    const label = `${tb.slots ? `${fmtSlot(tb.slots.starts_at)} ${tb.slots.region}` : "테이블"}${tb.venues ? ` · ${tb.venues.name}` : ""}`;
    return fromApps("table", label, (data ?? []) as unknown as AppRow[]);
  }
  const { data: u } = await db().from("users").select("id,name,deleted_at").eq("id", targetId).eq("role", "user").maybeSingle();
  if (!u) return { ok: false, message: "회원을 찾지 못했어요" };
  const userIds = noticeRecipients("member", [{ user_id: u.id, deleted_at: u.deleted_at }]);
  return { ok: true, label: `${u.name}님`, userIds, names: userIds.length ? [u.name] : [] };
}
