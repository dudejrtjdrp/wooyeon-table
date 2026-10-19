import { NextResponse } from "next/server";
import { getMe, isActiveAdmin } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { ATTEND, MATCH, PAYMENT, ageBand } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 참가자 목록과 테이블 결과 CSV (PRD 16장)
export async function GET(req: Request) {
  const me = await getMe();
  if (!isActiveAdmin(me)) return NextResponse.json({ ok: false }, { status: 401 });
  const roundId = new URL(req.url).searchParams.get("r") ?? "";
  const { data } = await db()
    .from("applications")
    .select("id,payment_status,match_status,attendance_status,realloc_count,table_id,users(name,profiles(birth_year,gender,mbti)),dining_tables(score,slots(region,starts_at),venues(name))")
    .eq("round_id", roundId);
  const rows = (data ?? []) as unknown as {
    id: string; payment_status: string; match_status: string; attendance_status: string | null; realloc_count: number; table_id: string | null;
    users: { name: string; profiles: { birth_year: number; gender: string; mbti: string | null } | null };
    dining_tables: { score: number; slots: { region: string; starts_at: string }; venues: { name: string } | null } | null;
  }[];
  // 생년은 내보내지 않고 연령대만 (개인정보는 필요한 화면에서만)
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  const head = ["신청ID", "이름", "연령대", "성별", "MBTI", "결제", "매칭", "참석", "재배치 횟수", "테이블ID", "테이블 점수", "지역", "모임 시각", "식당"];
  // 상태값은 화면과 같은 한국어 이름으로 (영문 코드는 운영자가 읽기 어렵다). 표에 없는 값은 그대로 둔다
  const ko = (map: Record<string, [string, unknown]>, v: string | null) => (v ? map[v]?.[0] ?? v : "");
  const kst = (iso?: string) => (iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "");
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.join(",")].concat(
    rows.map((r) =>
      [r.id, r.users.name, ageBand(r.users.profiles?.birth_year, year), r.users.profiles?.gender === "M" ? "남" : r.users.profiles?.gender === "F" ? "여" : "", r.users.profiles?.mbti, ko(PAYMENT, r.payment_status), ko(MATCH, r.match_status), ko(ATTEND, r.attendance_status), r.realloc_count, r.table_id, r.dining_tables ? Math.round(Number(r.dining_tables.score)) : "", r.dining_tables?.slots.region, kst(r.dining_tables?.slots.starts_at), r.dining_tables?.venues?.name]
        .map(esc)
        .join(","),
    ),
  );
  // 개인정보가 담긴 목록이라 누가 언제 내려받았는지 남긴다
  await logStatus({ entityType: "admin_export", entityId: me.id, field: "csv_export", to: String(rows.length), actor: `admin:${me.id}`, reason: `참가자·테이블 결과 CSV 내려받기 (회차 #${roundId.slice(0, 6)})` });
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="applicants-${roundId.slice(0, 8)}.csv"` },
  });
}
