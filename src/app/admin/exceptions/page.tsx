import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { resolveException } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  payment: "결제 오류", refund: "자동 환불 실패", data_missing: "데이터 누락", condition_conflict: "조건 충돌",
  venue_shortage: "식당 부족", notification: "알림 발송 실패", no_show: "노쇼 후보", safety: "안전 신고",
};

export default async function Exceptions({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requireAdmin();
  const { all } = await searchParams;
  let q = db().from("exceptions").select("*").order("created_at", { ascending: false }).limit(100);
  if (!all) q = q.eq("status", "open");
  const { data } = await q;
  const reportIds = (data ?? []).filter((e) => e.kind === "safety").map((e) => e.ref_id);
  const { data: reports } = reportIds.length
    ? await db().from("safety_reports").select("id,reason,detail,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)").in("id", reportIds)
    : { data: [] };
  const repMap = new Map(((reports ?? []) as unknown as { id: string; reason: string; detail: string | null; reporter: { name: string }; reported: { name: string } }[]).map((r) => [r.id, r]));

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[24px] font-bold">예외 처리함</h1>
          <p className="mt-1 text-[14px] text-muted">자동으로 해결되지 않은 것만 여기에 와요. 정상 흐름은 운영자가 볼 필요가 없어요.</p>
        </div>
        <Link href={all ? "/admin/exceptions" : "/admin/exceptions?all=1"} className="text-[14px] underline underline-offset-4">{all ? "열린 것만" : "처리한 것까지 보기"}</Link>
      </div>

      {!data?.length && <p className="mt-8 rounded-xl border border-line bg-card p-8 text-center text-muted">처리할 예외가 없어요.</p>}

      <ul className="mt-6 space-y-3">
        {data?.map((e) => {
          const rep = e.kind === "safety" ? repMap.get(e.ref_id) : undefined;
          return (
            <li key={e.id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[12px] font-medium text-accent">{LABEL[e.kind] ?? e.kind}</span>
                <span className="text-[12px] text-muted">{fmtDateTime(e.created_at)}</span>
                {e.status === "resolved" && <span className="text-[12px] text-leaf">처리됨 · {e.resolution}</span>}
              </div>
              <p className="mt-2 text-[15px]">{e.reason}</p>
              {rep && (
                <p className="mt-1 text-[13px] text-muted">
                  {rep.reporter?.name} → {rep.reported?.name} · {rep.reason}{rep.detail ? ` · "${rep.detail}"` : ""}
                </p>
              )}
              {e.status === "open" && (
                <form action={resolveException} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="note" placeholder="처리 메모 (기록에 남아요)" className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-[14px]" />
                  {e.kind === "no_show" ? (
                    <>
                      <button name="action" value="noshow" className="rounded-lg bg-ink px-3 py-2 text-[13px] text-white">노쇼 확정</button>
                      <button name="action" value="attended" className="rounded-lg border border-line px-3 py-2 text-[13px]">참석으로 정정</button>
                    </>
                  ) : e.kind === "safety" ? (
                    <>
                      <button name="action" value="none" className="rounded-lg border border-line px-3 py-2 text-[13px]">조치 없음</button>
                      <button name="action" value="warning" className="rounded-lg border border-line px-3 py-2 text-[13px]">경고</button>
                      <button name="action" value="restricted" className="rounded-lg bg-accent px-3 py-2 text-[13px] text-white">참가 제한</button>
                      <button name="action" value="banned" className="rounded-lg bg-ink px-3 py-2 text-[13px] text-white">영구 제한</button>
                    </>
                  ) : e.kind === "venue_shortage" ? (
                    <>
                      <button name="action" value="retry" className="rounded-lg bg-ink px-3 py-2 text-[13px] text-white">식당 다시 배정</button>
                      <button name="action" value="done" className="rounded-lg border border-line px-3 py-2 text-[13px]">직접 처리함</button>
                    </>
                  ) : (
                    <button name="action" value="done" className="rounded-lg bg-ink px-3 py-2 text-[13px] text-white">처리 완료</button>
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
