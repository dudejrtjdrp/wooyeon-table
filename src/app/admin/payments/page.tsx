import { Download } from "lucide-react";
import Link from "next/link";
import { passUsage } from "@/lib/admin-cells";
import { Badge, PageHeader, Stat, TableScroll, Term, btn, btnDanger, btnLight, ctl, table, td, tdNowrap, th } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { requireAdmin } from "@/lib/auth";
import { applicationLive, manualRefundCheck } from "@/lib/cancel-rules";
import { LEGACY_PASS_LABEL, PASSES, isMembership, won } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { PAYMENT, label } from "@/lib/labels";
import { PAYMENT_PAGE_SIZE, PAY_KINDS, PAY_METHODS, methodText, parsePaymentFilter, paymentFiltered, paymentSearch } from "@/lib/payment-filter";
import { loadPaymentTotals, loadPayments } from "@/lib/payment-query";
import { db } from "@/lib/supabase";
import { tossLive } from "@/lib/toss";
import { ConfirmButton } from "../confirm-button";
import { manualRefund } from "./actions";

export const dynamic = "force-dynamic";

/** 표 머리글과 풀이. 처음 보면 헷갈리는 칸만 풀이를 단다 */
const COLS: [string, string?][] = [
  ["결제 시각", "결제가 끝난 시각이에요. 아직 결제 전이면 결제를 만든 시각이에요."],
  ["참가자"],
  ["회차"],
  ["산 상품", "1회권·멤버십처럼 이번에 결제한 상품이에요. '보유 이용권 사용'은 돈을 내지 않고 남은 이용권으로 신청한 건이에요."],
  ["결제 수단"],
  ["금액"],
  ["결제 상태"],
  ["이용권 남은 횟수", "이 결제로 받은 이용권이 지금 몇 번 남았는지와 쓸 수 있는 기한이에요. 멤버십은 기한 안에 횟수 제한이 없어요."],
  ["환불 시각"],
  ["직접 환불", "자동 환불이 안 된 건만 여기서 사유를 적고 돌려줘요. 신청이 진행 중이면 신청자 화면에서 대리 취소해요."],
];

export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const f = parsePaymentFilter(await searchParams);
  const [{ data: rounds }, { rows, total }, sum] = await Promise.all([
    db().from("rounds").select("id,title").order("match_at", { ascending: false }),
    loadPayments(f),
    loadPaymentTotals(f),
  ]);
  const filtered = paymentFiltered(f);
  const pages = Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE));
  const back = `/admin/payments${paymentSearch(f)}`;

  return (
    <div>
      <PageHeader
        title="결제·환불"
        desc={<>결제, 자동 환불, 환불 실패, <Term tip={TIP.이용권}>이용권</Term> 사용 내역이에요. 결제는 토스페이먼츠{tossLive() ? "" : " 테스트 모드"}로 승인·취소돼요.</>}
        how={["이름·회차·상태로 찾기", "환불 실패는 예외 처리함에서 다시 요청", "신청이 끝난 결제만 여기서 사유를 적고 직접 환불"]}
        actions={
          <a href={`/api/admin/payments${paymentSearch(f, 1)}`} className={btnLight} download>
            <Download size={16} />CSV 내려받기
          </a>
        }
      />
      <p className="mt-6 text-[13px] text-muted">{filtered ? `아래 숫자는 고른 조건에 맞는 ${sum.count.toLocaleString("ko-KR")}건 기준이에요.` : "아래 숫자는 전체 결제 기준이에요."}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="결제 완료 금액" value={won(sum.paidSum)} sub={sum.demoPaidSum ? `시연 계정 모의 결제 ${won(sum.demoPaidSum)} 포함` : undefined} />
        <Stat label="자동 환불" value={`${sum.refundedN}건`} sub={won(sum.refundedSum)} />
        <Stat label="환불 실패" value={`${sum.failedRefund}건`} tone={sum.failedRefund ? "danger" : undefined} sub="실패만 예외 처리함으로 가요" />
        <Stat label="보유 이용권 사용" value={`${sum.passUses}건`} sub="결제 없이 신청한 건" />
      </div>
      <form className="shadow-card mt-6 grid gap-3 rounded-[20px] bg-card p-5 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">참가자 이름</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="이름 일부" className={`${ctl} mt-1.5 w-full`} />
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">회차</span>
          <select name="r" defaultValue={f.r ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 회차</option>
            {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">상태</span>
          <select name="s" defaultValue={f.s ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 상태</option>
            {Object.entries(PAYMENT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">종류</span>
          <select name="kind" defaultValue={f.kind ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 종류</option>
            {PAY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">결제 수단</span>
          <select name="method" defaultValue={f.method ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 수단</option>
            {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <div className="block">
          <span className="text-[13px] font-semibold text-ink">결제일</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input type="date" name="from" defaultValue={f.from} aria-label="결제일 시작" className={`${ctl} min-w-0 flex-1 px-2`} />
            <span className="text-muted">~</span>
            <input type="date" name="to" defaultValue={f.to} aria-label="결제일 끝" className={`${ctl} min-w-0 flex-1 px-2`} />
          </div>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button className={`${btn} whitespace-nowrap bg-accent text-white`}>조건으로 찾기</button>
          {filtered && <Link href="/admin/payments" className={`${btnLight} whitespace-nowrap`}>조건 풀기</Link>}
          <span className="ml-auto text-[12px] text-muted">결제일은 서울 날짜예요. 아직 결제 전인 건은 만든 날로 봐요.</span>
        </div>
      </form>
      <p className="mt-5 text-[14px] text-muted">
        {total === 0 ? "" : `${filtered ? "찾은 결과" : "모두"} ${total.toLocaleString("ko-KR")}건 · 최신순${pages > 1 ? ` · ${PAYMENT_PAGE_SIZE}건씩` : ""}`}
      </p>
      <TableScroll className="shadow-card mt-2 rounded-[20px] bg-card" label="결제 표">
        <table className={`${table} min-w-[1040px]`}>
          <thead className="border-b border-line"><tr>{COLS.map(([h, tip]) => <th key={h} className={th}>{tip ? <Term tip={tip}>{h}</Term> : h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={`${tdNowrap} text-muted`}>{fmtDateTime(p.paid_at ?? p.created_at)}</td>
                <td className={tdNowrap}>{p.applications[0] ? <Link href={`/admin/applicants/${p.applications[0].id}`} className="font-semibold text-accent hover:underline">{p.users.name}</Link> : p.users.name}</td>
                <td className={`${td} min-w-[140px]`}>{p.applications.map((a) => a.rounds.title).join(", ") || "-"}</td>
                <td className={`${td} min-w-[120px]`}>{p.provider === "pass" ? "보유 이용권 사용" : (PASSES[p.pass_type as keyof typeof PASSES]?.label ?? LEGACY_PASS_LABEL[p.pass_type ?? ""]) ?? "-"}</td>
                <td className={`${td} min-w-[150px]`}>
                  {p.provider === "toss" ? (
                    <span>{methodText(p)}{p.receipt_url ? <> · <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">영수증</a></> : null}</span>
                  ) : p.provider === "pass" ? "-" : <span className="text-muted">{methodText(p)}</span>}
                  {p.refund_error && <p className="mt-0.5 text-[12px] text-danger">{p.refund_error}</p>}
                </td>
                <td className={`${tdNowrap} tabular-nums`}>{won(p.amount)}</td>
                <td className={tdNowrap}><Badge v={label(PAYMENT, p.status)} /></td>
                <td className={`${td} min-w-[170px]`}>{passUsage(p.pass_type, p.passes)}</td>
                <td className={`${tdNowrap} text-muted`}>{p.refunded_at ? fmtDateTime(p.refunded_at) : "-"}</td>
                <td className={`${td} min-w-[260px]`}>
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
        {!rows.length && <p className="p-10 text-center text-muted">{filtered ? "조건에 맞는 결제가 없어요. 조건을 풀어 보세요." : f.page > 1 ? "이 쪽에는 결제가 없어요. 앞 쪽으로 가 보세요." : "결제 내역이 없어요."}</p>}
      </TableScroll>
      {pages > 1 && (
        <nav aria-label="쪽 넘기기" className="mt-4 flex items-center justify-center gap-2">
          {f.page > 1 ? <Link href={`/admin/payments${paymentSearch(f, f.page - 1)}`} className={btnLight}>이전</Link> : <span className={`${btnLight} pointer-events-none opacity-40`}>이전</span>}
          <span className="px-3 text-[14px] tabular-nums text-muted">{f.page} / {pages}쪽</span>
          {f.page < pages ? <Link href={`/admin/payments${paymentSearch(f, f.page + 1)}`} className={btnLight}>다음</Link> : <span className={`${btnLight} pointer-events-none opacity-40`}>다음</span>}
        </nav>
      )}
    </div>
  );
}
