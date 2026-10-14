import { NextRequest, NextResponse } from "next/server";
import { vapid } from "@/lib/push";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";

// 공개 키 (브라우저 구독에 필요)
export async function GET() {
  const k = await vapid();
  return NextResponse.json({ publicKey: k.publicKey });
}

// 이 기기를 푸시 받을 기기로 등록
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  await db().from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    user_id: s.uid,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  return NextResponse.json({ ok: true });
}

// 이 기기 등록 해제
export async function DELETE(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: true });
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await db().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", s.uid);
  return NextResponse.json({ ok: true });
}
