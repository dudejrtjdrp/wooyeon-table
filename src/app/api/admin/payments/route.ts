import { NextResponse } from "next/server";
import { csvCell } from "@/lib/audit";
import { now } from "@/lib/clock";
import { getMe, isActiveAdmin } from "@/lib/auth";
import { LEGACY_PASS_LABEL, PASSES } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { PAYMENT } from "@/lib/labels";
import { describePaymentFilter, methodText, parsePaymentFilter } from "@/lib/payment-filter";
import { loadPaymentsAll } from "@/lib/payment-query";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX = 5000;

// 결제·환불 CSV. 화면과 같은 거르기를 그대로 받고, 내려받은 사실도 이력에 남긴다 (PRD 11장 결제·환불, 16장 운영 및 추적)
// 개인정보는 이름만 넣는다. 연락처·영수증 주소는 넣지 않는다.
export async function GET(req: Request) {
  const me = await getMe();
  if (!isActiveAdmin(me)) return NextResponse.json({ ok: false }, { status: 401 });
  const f = { ...parsePaymentFilter(Object.fromEntries(new URL(req.url).searchParams)), page: 1 };
  const [rows, { data: round }] = await Promise.all([
    loadPaymentsAll(f, MAX),
    f.r ? db().from("rounds").select("title").eq("id", f.r).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const kst = (iso: string | null) => (iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "");
  const kind = (p: (typeof rows)[number]) => (p.provider === "pass" ? "보유 이용권 사용" : PASSES[p.pass_type as keyof typeof PASSES]?.label ?? LEGACY_PASS_LABEL[p.pass_type ?? ""] ?? "");
  const lines = [["결제 시각", "참가자", "회차", "종류", "결제 수단", "금액", "상태", "환불 시각", "환불 실패 사유", "결제 번호"].map(csvCell).join(",")];
  for (const p of rows) {
    lines.push(
      [kst(p.paid_at ?? p.created_at), p.users?.name, p.applications.map((a) => a.rounds.title).join(", "), kind(p), methodText(p), p.amount, PAYMENT[p.status]?.[0] ?? p.status, kst(p.refunded_at), p.refund_error, p.id]
        .map(csvCell)
        .join(","),
    );
  }

  await logStatus({
    entityType: "admin_export",
    entityId: me.id,
    field: "csv_export",
    to: String(rows.length),
    actor: `admin:${me.id}`,
    reason: `결제·환불 CSV 내려받기 (${describePaymentFilter(f, round?.title)}${rows.length >= MAX ? `, 최대 ${MAX.toLocaleString("ko-KR")}건까지` : ""})`,
  });

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(await now());
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payments-${stamp}.csv"`, "cache-control": "no-store" },
  });
}
