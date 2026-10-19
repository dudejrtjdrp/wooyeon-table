import Link from "next/link";
import { Badge, Panel } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { reportStatusText } from "@/lib/safety-rules";
import { db } from "@/lib/supabase";
import { FeedbackHeader } from "../header";
import { ReopenForm } from "../person-safety";

export const dynamic = "force-dynamic";

type Rep = { id: string; reporter_id: string; reported_id: string; reason: string; detail: string | null; status: string; action: string | null; created_at: string; reporter: { name: string } | null; reported: { name: string } | null };

/** 피드백·안전 › 안전 신고. 검토 대기 건은 위에, 조치는 예외 처리함에서 */
export default async function Reports({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await requireAdmin();
  const { r } = await searchParams;
  const { data } = await db()
    .from("safety_reports")
    .select("id,reporter_id,reported_id,reason,detail,status,action,created_at,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const reps = ((data ?? []) as unknown as Rep[]).sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
  const open = reps.filter((x) => x.status === "open").length;
  const back = `/admin/feedback/reports${r ? `?r=${encodeURIComponent(r)}` : ""}`;
  const person = (id: string) => `/admin/feedback/person?u=${id}${r ? `&r=${encodeURIComponent(r)}` : ""}`;

  return (
    <div>
      <FeedbackHeader
        current="/admin/feedback/reports"
        r={r}
        desc="신고가 들어오면 두 사람을 바로 다른 테이블로 나누고, 운영자 검토를 기다려요. 경고·참가 제한 같은 조치는 예외 처리함에서 해요."
        how={["'검토 대기' 건 확인", "이름을 눌러 그 사람의 기록 보기", "예외 처리함에서 조치"]}
      />
      <Panel title={`신고 ${reps.length}건${open ? ` · 검토 대기 ${open}건` : ""}`} className="mt-6" action={<Link href="/admin/exceptions?k=safety" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline">예외 처리함에서 조치</Link>}>
        <ul className="divide-y divide-line text-[14px]">
          {reps.map((x) => (
            <li key={x.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={person(x.reporter_id)} className="hover:text-accent">{x.reporter?.name ?? "알 수 없음"}</Link> → <Link href={person(x.reported_id)} className="font-bold hover:text-accent">{x.reported?.name ?? "알 수 없음"}</Link>
                </span>
                <Badge v={x.status === "open" ? ["검토 대기", "danger"] : [reportStatusText(x), "leaf"]} />
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{x.reason}{x.detail ? `, "${x.detail}"` : ""} · {fmtDateTime(x.created_at)}</p>
              {x.status !== "open" && <ReopenForm id={x.id} back={back} canWrite={me.level === "full"} />}
            </li>
          ))}
          {!reps.length && <li className="py-2 text-muted">신고가 없어요.</li>}
        </ul>
      </Panel>
    </div>
  );
}
