import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 단체방의 마지막 메시지 시각만 돌려준다. 바뀌었을 때만 화면을 다시 그리게 하려고.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { data: room } = await db().from("chat_rooms").select("id").eq("table_id", id).maybeSingle();
  if (!room) return NextResponse.json({ last: null });
  const { data } = await db().from("chat_messages").select("created_at").eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ last: data?.created_at ?? null }, { headers: { "Cache-Control": "no-store" } });
}
