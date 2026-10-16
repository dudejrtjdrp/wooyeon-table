import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/auth";
import { authorizeUrl, CONFIG, isEnabled, isProvider } from "@/lib/oauth";

// 소셜 로그인 시작: state를 쿠키에 담고 제공자 로그인 화면으로 보낸다
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = req.nextUrl.origin;
  if (!isProvider(provider)) return NextResponse.redirect(new URL("/login", origin));
  if (!isEnabled(provider)) {
    return NextResponse.redirect(new URL(`/login?e=${encodeURIComponent(`${CONFIG[provider].label} 로그인은 준비 중이에요`)}`, origin));
  }
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(provider, origin, state));
  res.cookies.set("wt_oauth", JSON.stringify({ state, provider, next: safeNext(next) ?? "/" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
