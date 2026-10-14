import Link from "next/link";
import { Badge, PageHeader, Stat, btnLight, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { PASSES, won } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { PAYMENT, label } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Payments({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireAdmin();
  const { s } = await searchParams;
  let q = db()
    .from("payments")
    .select("id,amount,status,provider,pass_type,paid_at,refunded_at,created_at,users(name),passes(remaining,total_count,expires_at),applications(id,rounds(title))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (s) q = q.eq("status", s);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; amount: number; status: string; provider: string; pass_type: string | null; paid_at: string | null; refunded_at: string | null; created_at: string;
    users: { name: string }; passes: { remaining: number; total_count: number; expires_at: string | null } | null; applications: { id: string; rounds: { title: string } }[];
  }[];
  const { data: all } = await db().from("payments").select("amount,status,provider");
  const paidSum = (all ?? []).filter((p) => ["PAID"].includes(p.status)).reduce((n, p) => n + p.amount, 0);
  const refunded = (all ?? []).filter((p) => p.status === "REFUNDED");
  const failedRefund = (all ?? []).filter((p) => p.status === "REFUND_FAILED").length;
  const passUses = (all ?? []).filter((p) => p.provider === "pass").length;

  return (
    <div>
      <PageHeader title="결제·환불" desc="결제, 자동 환불, 환불 실패, 이용권 사용 내역이에요. 지금은 모의 결제예요." />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="결제 완료 금액" value={won(paidSum)} />
        <Stat label="자동 환불" value={`${refunded.length}건`} sub={won(refunded.reduce((n, p) => n + p.amount, 0))} />
        <Stat label="환불 실패" value={`${failedRefund}건`} tone={failedRefund ? "danger" : undefined} sub="실패만 예외 처리함으로 가요" />
        <Stat label="보유 이용권 사용" value={`${passUses}건`} sub="결제 없이 신청한 건" />
      </div>
      <form className="mt-6 flex gap-2">
        <select name="s" defaultValue={s ?? ""} className={ctl}>
          <option value="">모든 상태</option>
          {Object.entries(PAYMENT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className={btnLight}>보기</button>
      </form>
      <div className="mt-3 overflow-x-auto rounded-2xl bg-card">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead className="border-b border-line"><tr>{["시각", "참가자", "회차", "이용권", "금액", "상태", "이용권 남은 횟수", "환불 시각"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={`${td} text-muted`}>{fmtDateTime(p.paid_at ?? p.created_at)}</td>
                <td className={td}>{p.applications[0] ? <Link href={`/admin/applicants/${p.applications[0].id}`} className="font-semibold text-accent hover:underline">{p.users.name}</Link> : p.users.name}</td>
                <td className={td}>{p.applications.map((a) => a.rounds.title).join(", ") || "-"}</td>
                <td className={td}>{p.provider === "pass" ? "보유 이용권 사용" : PASSES[p.pass_type as keyof typeof PASSES]?.label ?? "-"}</td>
                <td className={`${td} tabular-nums`}>{won(p.amount)}</td>
                <td className={td}><Badge v={label(PAYMENT, p.status)} /></td>
                <td className={td}>{p.passes ? `${p.passes.remaining}/${p.passes.total_count}회${p.passes.expires_at ? `, ~${fmtDateTime(p.passes.expires_at).split(" ").slice(0, 2).join(" ")}` : ""}` : "-"}</td>
                <td className={`${td} text-muted`}>{p.refunded_at ? fmtDateTime(p.refunded_at) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-muted">결제 내역이 없어요.</p>}
      </div>
    </div>
  );
}
