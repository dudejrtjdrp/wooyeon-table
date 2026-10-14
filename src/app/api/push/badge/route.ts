// 앱 아이콘 배지에 표시할 안 읽은 알림 수
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ count: 0 });
  const { count } = await db().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", s.uid).eq("status", "sent").is("read_at", null);
  return NextResponse.json({ count: count ?? 0 });
}
