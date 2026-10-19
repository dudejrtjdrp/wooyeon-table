import { NextResponse } from "next/server";
import { auditChange, auditTarget, csvCell, describeFilter, maskText, parseAuditFilter } from "@/lib/audit";
import { auditContext, loadAuditAll, templateLabel } from "@/lib/audit-query";
import { getMe, isActiveAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { actorLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const MAX = 5000;

// 변경 이력 CSV. 화면과 같은 거르기를 그대로 받고, 내려받은 사실도 이력에 남긴다 (PRD 16장 운영 및 추적)
export async function GET(req: Request) {
  const me = await getMe();
  if (!isActiveAdmin(me)) return NextResponse.json({ ok: false }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = { ...parseAuditFilter(sp), page: 1 };
  const rows = await loadAuditAll(f, MAX);

  // 대상 이름은 200줄씩 모아서 찾는다 (in 조건 주소가 너무 길어지지 않게)
  const lines = [["시각", "누가", "대상 종류", "대상", "바뀐 내용", "사유", "이력 번호"].map(csvCell).join(",")];
  const kst = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
  let names = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { ctx, adminNames } = await auditContext(chunk);
    names = new Map([...names, ...adminNames]);
    for (const e of chunk) {
      const t = auditTarget(e, ctx);
      lines.push([kst(e.created_at), actorLabel(e.actor, adminNames), t.kind, t.name, maskText(auditChange(e, templateLabel)), maskText(e.reason ?? ""), e.id].map(csvCell).join(","));
    }
  }

  await logStatus({
    entityType: "admin_export",
    entityId: me.id,
    field: "csv_export",
    to: String(rows.length),
    actor: `admin:${me.id}`,
    reason: `변경 이력 CSV 내려받기 (${describeFilter(f, names)}${rows.length >= MAX ? `, 최대 ${MAX.toLocaleString("ko-KR")}건까지` : ""})`,
  });

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="audit-${stamp}.csv"`, "cache-control": "no-store" },
  });
}
