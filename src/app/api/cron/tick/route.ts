import { NextResponse } from "next/server";
import { maybeTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 스케줄러가 부른다: GitHub Actions 10분마다(.github/workflows/tick.yml) + Vercel Cron 하루 한 번(백업).
// 화면을 열 때도 같은 작업이 돌므로, 1분 안에 이미 돌았으면 건너뛴다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const done = await maybeTick(60);
  return NextResponse.json({ ok: true, skipped: done === null, done: done ?? [] });
}
