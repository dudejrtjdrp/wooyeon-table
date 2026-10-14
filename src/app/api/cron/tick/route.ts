import { NextResponse } from "next/server";
import { tick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron이 하루 한 번 부르고, 어드민 화면과 시연 패널도 같은 작업을 부른다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const done = await tick();
  return NextResponse.json({ ok: true, done });
}
