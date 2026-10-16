import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { resolveException } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  payment: "결제 오류", refund: "자동 환불 실패", data_missing: "데이터 누락", condition_conflict: "조건 충돌",
  venue_shortage: "식당 부족", notification: "알림 발송 실패", no_show: "노쇼 후보", safety: "안전 신고", reservation: "식당 예약 실패",
};

const TONE: Record<string, string> = { safety: "ring-danger/40", payment: "ring-accent/30", refund: "ring-accent/30", venue_shortage: "ring-warn/40", no_show: "ring-warn/40" };
const PILL: Record<string, string> = { safety: "bg-danger/10 text-danger", payment: "bg-accent-soft text-accent", refund: "bg-accent-soft text-accent", venue_shortage: "bg-warn-soft text-warn", no_show: "bg-warn-soft text-warn" };

export default async function Exceptions({ searchParams }: { searchParams: Promise<{ all?: string; k?: string; m?: string }> }) {
  await requireAdmin();
  const { all, k, m } = await searchParams;
  let q = db().from("exceptions").select("*").order("created_at", { ascending: false }).limit(100);
  if (!all) q = q.eq("status", "open");
  const { data: rows } = await q;
  const counts = new Map<string, number>();
  for (const e of rows ?? []) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const data = k ? (rows ?? []).filter((e) => e.kind === k) : rows;
  const qs = (kind?: string) => { const p = new URLSearchParams(); if (all) p.set("all", "1"); if (kind) p.set("k", kind); const x = p.toString(); return `/admin/exceptions${x ? `?${x}` : ""}`; };
  const reportIds = (data ?? []).filter((e) => e.kind === "safety").map((e) => e.ref_id);
  const { data: reports } = reportIds.length
    ? await db().from("safety_reports").select("id,reason,detail,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)").in("id", reportIds)
    : { data: [] };
  const repMap = new Map(((reports ?? []) as unknown as { id: string; reason: string; detail: string | null; reporter: { name: string }; reported: { name: string } }[]).map((r) => [r.id, r]));

  return (
    <div>
      <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">예외 처리함</h1>
      <p className="mt-1.5 text-[15px] text-muted">자동으로 해결하지 못한 일만 모았어요.</p>
      {m && <p role="status" className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-[14px] font-semibold text-warn">{m}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={qs()} className={`rounded-full px-4 py-2 text-[15px] font-semibold ${!k ? "bg-accent-soft text-accent" : "border border-line bg-card text-ink/80"}`}>전체 {rows?.length ?? 0}</Link>
        {[...counts.entries()].map(([kind, n]) => (
          <Link key={kind} href={qs(kind)} className={`rounded-full px-4 py-2 text-[15px] ${k === kind ? "bg-accent-soft font-semibold text-accent" : "border border-line bg-card text-ink/80"}`}>{LABEL[kind] ?? kind} {n}</Link>
        ))}
        <Link href={all ? (k ? `/admin/exceptions?k=${k}` : "/admin/exceptions") : `/admin/exceptions?all=1${k ? `&k=${k}` : ""}`} className="ml-auto flex items-center gap-2 text-[14px] text-muted">
          <span className={`flex size-5 items-center justify-center rounded-md border-2 ${all ? "border-accent bg-accent text-white" : "border-line"}`}>{all ? "✓" : ""}</span>처리한 것까지 보기
        </Link>
      </div>

      {!data?.length && <p className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center text-muted">처리할 예외가 없어요. 모두 자동으로 처리됐어요.</p>}

      <ul className="mt-6 space-y-3">
        {data?.map((e) => {
          const rep = e.kind === "safety" ? repMap.get(e.ref_id) : undefined;
          return (
            <li key={e.id} className={`shadow-card rounded-[20px] bg-card p-6 ring-1 ${e.status === "open" ? TONE[e.kind] ?? "ring-line" : "ring-line"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-[14px] font-semibold ${PILL[e.kind] ?? "bg-danger/10 text-danger"}`}>{LABEL[e.kind] ?? e.kind}</span>
                <span className="text-[14px] text-muted">{fmtDateTime(e.created_at)}</span>
                {e.status === "resolved" && <span className="text-[12px] text-leaf">처리됨 · {e.resolution}</span>}
              </div>
              <p className="mt-3 text-[16px] font-semibold text-ink">{e.reason}</p>
              {rep && (
                <p className="mt-1 text-[13px] text-muted">
                  {rep.reporter?.name} → {rep.reported?.name} · {rep.reason}{rep.detail ? ` · "${rep.detail}"` : ""}
                </p>
              )}
              {e.status === "open" && (
                <form action={resolveException} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="note" placeholder="처리 메모를 입력해 주세요 (기록에 남아요)" className="h-10 min-w-48 flex-1 rounded-xl border border-line bg-field px-3.5 text-[14px] outline-none focus:border-accent" />
                  {e.kind === "no_show" && e.ref_type === "user" ? (
                    <>
                      <button name="action" value="ban" className="h-10 rounded-xl bg-danger px-4 text-[13px] font-semibold text-white">영구 제한</button>
                      <button name="action" value="lift" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">소명 확인, 제한 풀기</button>
                    </>
                  ) : e.kind === "no_show" ? (
                    <>
                      <button name="action" value="noshow" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">노쇼 확정</button>
                      <button name="action" value="attended" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">참석으로 정정</button>
                    </>
                  ) : e.kind === "safety" ? (
                    <>
                      <button name="action" value="none" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">조치 없음</button>
                      <button name="action" value="warning" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">경고</button>
                      <button name="action" value="restricted" className="h-10 rounded-xl border border-danger/50 bg-danger/5 px-4 text-[13px] font-semibold text-danger">참가 제한</button>
                      <button name="action" value="banned" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">영구 제한</button>
                    </>
                  ) : e.kind === "refund" ? (
                    <>
                      <button name="action" value="retry_refund" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">환불 다시 요청</button>
                      <button name="action" value="done" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">직접 처리함</button>
                    </>
                  ) : e.kind === "reservation" ? (
                    <>
                      <Link href={`/admin/tables/${e.ref_id}#reservation`} className="flex h-10 items-center rounded-xl border border-line px-4 text-[13px] font-semibold text-ink">예약 페이지·정보 보기</Link>
                      <button name="action" value="retry_reservation" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">예약 다시 시도</button>
                      <button name="action" value="reserved" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">직접 예약함(메모에 예약번호)</button>
                    </>
                  ) : e.kind === "notification" && (e.ref_type === "chat_room" || e.ref_type === "notification") ? (
                    <>
                      <button name="action" value="resend" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">다시 보내기</button>
                      <button name="action" value="done" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">직접 연락함</button>
                    </>
                  ) : e.kind === "venue_shortage" ? (
                    <>
                      <button name="action" value="retry" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">식당 다시 배정</button>
                      <button name="action" value="done" className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">직접 처리함</button>
                    </>
                  ) : (
                    <button name="action" value="done" className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">처리 완료</button>
                  )}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
