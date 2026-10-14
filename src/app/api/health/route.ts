import { NextResponse } from "next/server";
import { db, hasDbEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDbEnv()) {
    return NextResponse.json({ ok: false, db: "환경 변수 없음" }, { status: 503 });
  }
  const { error } = await db().from("app_clock").select("id").limit(1);
  return NextResponse.json(
    { ok: !error, db: error ? error.message : "연결됨" },
    { status: error ? 503 : 200 },
  );
}
