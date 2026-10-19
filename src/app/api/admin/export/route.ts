import { NextResponse } from "next/server";
import { describeApplicantFilter, parseApplicantFilter } from "@/lib/applicant-filter";
import { loadApplicants } from "@/lib/applicant-query";
import { csvCell } from "@/lib/audit";
import { getMe, isActiveAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { logStatus } from "@/lib/events";
import { ATTEND, MATCH, PAYMENT, ageBand } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 참가자 목록과 테이블 결과 CSV (PRD 16장). 신청자 목록 화면의 거르기를 그대로 받아 같은 사람만 내보낸다
export async function GET(req: Request) {
  const me = await getMe();
  if (!isActiveAdmin(me)) return NextResponse.json({ ok: false }, { status: 401 });
  const f = parseApplicantFilter(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.r) return NextResponse.json({ ok: false, error: "회차를 골라 주세요" }, { status: 400 });
  const roundId = f.r;
  const [{ rows, history }, { data: round }] = await Promise.all([
    loadApplicants(f, roundId),
    db().from("rounds").select("title").eq("id", roundId).maybeSingle(),
  ]);
  // 생년은 내보내지 않고 연령대만, 연락처는 넣지 않는다 (개인정보는 필요한 화면에서만)
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(await now()));
  const head = ["신청ID", "이름", "연령대", "성별", "MBTI", "희망 동네", "결제", "매칭", "참석", "이전 참석", "이전 노쇼", "받은 신고", "재배치 횟수", "테이블ID", "테이블 점수", "지역", "모임 시각", "식당"];
  // 상태값은 화면과 같은 한국어 이름으로 (영문 코드는 운영자가 읽기 어렵다). 표에 없는 값은 그대로 둔다
  const ko = (map: Record<string, [string, unknown]>, v: string | null) => (v ? map[v]?.[0] ?? v : "");
  const kst = (iso?: string) => (iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "");
  const lines = [head.map(csvCell).join(",")].concat(
    rows.map((r) => {
      const p = r.users.profiles;
      const h = history.get(r.user_id) ?? { attended: 0, noShows: 0, reports: 0 };
      return [
        r.id, r.users.name, ageBand(p?.birth_year, year), p?.gender === "M" ? "남" : p?.gender === "F" ? "여" : "", p?.mbti,
        [...new Set(r.application_slots.map((x) => x.slots?.region).filter(Boolean))].join(" · "),
        ko(PAYMENT, r.payment_status), r.application_status === "CANCELED" ? "신청 취소" : ko(MATCH, r.match_status), ko(ATTEND, r.attendance_status),
        h.attended, h.noShows, h.reports,
        r.realloc_count, r.table_id, r.dining_tables ? Math.round(Number(r.dining_tables.score)) : "", r.dining_tables?.slots.region, kst(r.dining_tables?.slots.starts_at), r.dining_tables?.venues?.name,
      ]
        .map(csvCell)
        .join(",");
    }),
  );
  // 개인정보가 담긴 목록이라 누가 언제 어떤 조건으로 내려받았는지 남긴다
  await logStatus({ entityType: "admin_export", entityId: me.id, field: "csv_export", to: String(rows.length), actor: `admin:${me.id}`, reason: `참가자·테이블 결과 CSV 내려받기 (${describeApplicantFilter(f, round?.title)})` });
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="applicants-${roundId.slice(0, 8)}.csv"`, "cache-control": "no-store" },
  });
}
