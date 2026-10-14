import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 참가자 목록과 테이블 결과 CSV (PRD 16장)
export async function GET(req: Request) {
  const me = await getMe();
  if (!me || me.role !== "admin") return NextResponse.json({ ok: false }, { status: 401 });
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
  const head = ["신청ID", "이름", "출생연도", "성별", "MBTI", "결제", "매칭", "참석", "재배치", "테이블ID", "테이블 점수", "지역", "모임 시각", "식당"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.join(",")].concat(
    rows.map((r) =>
      [r.id, r.users.name, r.users.profiles?.birth_year, r.users.profiles?.gender, r.users.profiles?.mbti, r.payment_status, r.match_status, r.attendance_status, r.realloc_count, r.table_id, r.dining_tables?.score, r.dining_tables?.slots.region, r.dining_tables?.slots.starts_at, r.dining_tables?.venues?.name]
        .map(esc)
        .join(","),
    ),
  );
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="applicants-${roundId.slice(0, 8)}.csv"` },
  });
}
