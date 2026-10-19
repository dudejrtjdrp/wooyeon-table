import Link from "next/link";
import { Badge, PageHeader, Stat, btnDanger, btnLight, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { applicationLive, manualRefundCheck } from "@/lib/cancel-rules";
import { LEGACY_PASS_LABEL, PASSES, isMembership, won } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { PAYMENT, label } from "@/lib/labels";
import { escapeLike } from "@/lib/members";
import { db } from "@/lib/supabase";
import { tossLive } from "@/lib/toss";
import { ConfirmButton } from "../confirm-button";
import { manualRefund } from "./actions";

export const dynamic = "force-dynamic";

export default async function Payments({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; r?: string }> }) {
  const me = await requireAdmin();
  const { s, q: rawName, r } = await searchParams;
  const name = (rawName ?? "").trim().slice(0, 40);
  const { data: rounds } = await db().from("rounds").select("id,title").order("match_at", { ascending: false });
  let q = db()
    .from("payments")
    .select("id,amount,status,provider,method,receipt_url,refund_error,pg_order_id,pass_type,paid_at,refunded_at,created_at,users(name),passes(remaining,total_count,expires_at),applications(id,match_status,attendance_status,application_status,rounds(title))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (s) q = q.eq("status", s);
  // 이름은 회원에서, 회차는 그 회차 신청에 걸린 결제에서 거른다
  let none = false;
  if (name) {
    const { data: us } = await db().from("users").select("id").ilike("name", `%${escapeLike(name)}%`).limit(200);
    const ids = (us ?? []).map((u) => u.id);
    if (ids.length) q = q.in("user_id", ids);
    else none = true;
  }
  if (r) {
    const { data: ap } = await db().from("applications").select("payment_id").eq("round_id", r).not("payment_id", "is", null);
    const ids = [...new Set((ap ?? []).map((a) => a.payment_id as string))];
    if (ids.length) q = q.in("id", ids);
    else none = true;
  }
  const { data } = none ? { data: [] } : await q;
  const rows = (data ?? []) as unknown as {
    id: string; amount: number; status: string; provider: string; method: string | null; receipt_url: string | null; refund_error: string | null; pg_order_id: string | null; pass_type: string | null; paid_at: string | null; refunded_at: string | null; created_at: string;
    users: { name: string }; passes: { remaining: number; total_count: number; expires_at: string | null } | null;
    applications: { id: string; match_status: string; attendance_status: string | null; application_status: string; rounds: { title: string } }[];
  }[];
  const back = `/admin/payments?${new URLSearchParams(Object.entries({ q: name, r: r ?? "", s: s ?? "" }).filter(([, v]) => v)).toString()}`.replace(/\?$/, "");
  const { data: all } = await db().from("payments").select("amount,status,provider");
  const paidSum = (all ?? []).filter((p) => ["PAID"].includes(p.status)).reduce((n, p) => n + p.amount, 0);
  const refunded = (all ?? []).filter((p) => p.status === "REFUNDED");
  const failedRefund = (all ?? []).filter((p) => p.status === "REFUND_FAILED").length;
  const passUses = (all ?? []).filter((p) => p.provider === "pass").length;

  return (
    <div>
      <PageHeader title="결제·환불" desc={`결제, 자동 환불, 환불 실패, 이용권 사용 내역이에요. 결제는 토스페이먼츠${tossLive() ? "" : " 테스트 모드"}로 승인·취소돼요.`} />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="결제 완료 금액" value={won(paidSum)} />
        <Stat label="자동 환불" value={`${refunded.length}건`} sub={won(refunded.reduce((n, p) => n + p.amount, 0))} />
        <Stat label="환불 실패" value={`${failedRefund}건`} tone={failedRefund ? "danger" : undefined} sub="실패만 예외 처리함으로 가요" />
        <Stat label="보유 이용권 사용" value={`${passUses}건`} sub="결제 없이 신청한 건" />
      </div>
      <form className="mt-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={name} placeholder="참가자 이름" aria-label="참가자 이름" className={`${ctl} w-44`} />
        <select name="r" defaultValue={r ?? ""} aria-label="회차" className={ctl}>
          <option value="">모든 회차</option>
          {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <select name="s" defaultValue={s ?? ""} aria-label="결제 상태" className={ctl}>
          <option value="">모든 상태</option>
          {Object.entries(PAYMENT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className={btnLight}>보기</button>
      </form>
      <div className="mt-3 shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
        <table className="w-full min-w-[1040px] text-[14px]">
          <thead className="border-b border-line"><tr>{["시각", "참가자", "회차", "이용권", "결제 수단", "금액", "상태", "이용권 남은 횟수", "환불 시각", "환불"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={`${td} text-muted`}>{fmtDateTime(p.paid_at ?? p.created_at)}</td>
                <td className={td}>{p.applications[0] ? <Link href={`/admin/applicants/${p.applications[0].id}`} className="font-semibold text-accent hover:underline">{p.users.name}</Link> : p.users.name}</td>
                <td className={td}>{p.applications.map((a) => a.rounds.title).join(", ") || "-"}</td>
                <td className={td}>{p.provider === "pass" ? "보유 이용권 사용" : (PASSES[p.pass_type as keyof typeof PASSES]?.label ?? LEGACY_PASS_LABEL[p.pass_type ?? ""]) ?? "-"}</td>
                <td className={td}>
                  {p.provider === "toss" ? (
                    <span>토스 · {p.method ?? "카드"}{p.receipt_url ? <> · <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">영수증</a></> : null}</span>
                  ) : p.provider === "pass" ? "-" : <span className="text-muted">모의 결제</span>}
                  {p.refund_error && <p className="mt-0.5 text-[12px] text-danger">{p.refund_error}</p>}
                </td>
                <td className={`${td} tabular-nums`}>{won(p.amount)}</td>
                <td className={td}><Badge v={label(PAYMENT, p.status)} /></td>
                <td className={td}>{p.passes ? `${p.passes.remaining}/${p.passes.total_count}회${p.passes.expires_at ? `, ~${fmtDateTime(p.passes.expires_at).split(" ").slice(0, 2).join(" ")}` : ""}` : "-"}</td>
                <td className={`${td} text-muted`}>{p.refunded_at ? fmtDateTime(p.refunded_at) : "-"}</td>
                <td className={`${td} min-w-[220px]`}>
                  {me.level === "full" && manualRefundCheck({ status: p.status, provider: p.provider, amount: p.amount, hasApplication: p.applications.length > 0 }).ok ? (() => {
                    const a = p.applications[0];
                    // 신청이 진행 중이면 돈만 돌려주지 않는다. 대리 취소하면 같은 규칙으로 환불도 함께 된다 (cancel-rules.ts)
                    if (applicationLive({ applicationStatus: a.application_status, matchStatus: a.match_status, attendanceStatus: a.attendance_status }))
                      return (
                        <span className="text-[13px] text-muted">
                          신청 진행 중 ·{" "}
                          <Link href={`/admin/applicants/${a.id}`} className="font-semibold text-accent underline-offset-4 hover:underline">신청자 화면에서 대리 취소</Link>
                          하면 환불도 함께 돼요
                        </span>
                      );
                    const member = isMembership(p.pass_type);
                    return (
                      <form action={manualRefund} className="flex items-center gap-2">
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="back" value={back} />
                        <input name="note" required minLength={4} placeholder="환불 사유" aria-label={`${p.users.name}님 환불 사유`} className={`${ctl} w-32`} />
                        <ConfirmButton
                          confirm={`${p.users.name}님께 ${won(p.amount)}을 결제한 수단으로 전액 돌려드릴까요? 되돌릴 수 없어요.${member ? " 멤버십 기간도 바로 끝나요." : ""}`}
                          className={btnDanger}
                        >
                          환불
                        </ConfirmButton>
                      </form>
                    );
                  })() : <span className="text-muted">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-muted">{name || r || s ? "조건에 맞는 결제가 없어요. 거르기를 풀어 보세요." : "결제 내역이 없어요."}</p>}
      </div>
    </div>
  );
}
