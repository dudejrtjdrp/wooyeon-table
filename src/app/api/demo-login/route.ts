import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";
import { db } from "@/lib/supabase";

/**
 * 심사 투어의 '참가자 앱에서 보기' 링크(새 탭)용: 시연 계정(is_demo)으로만 비밀번호 없이 들어가 그 화면을 연다.
 * /guide의 demoLogin과 같은 규칙. 참가자 세션 쿠키만 바뀌어서 같은 브라우저의 운영자 로그인은 그대로 남는다
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const loginId = url.searchParams.get("login") ?? "";
  const to = url.searchParams.get("to") ?? "/";
  const { data: u } = await db().from("users").select("id,role,is_demo").eq("login_id", loginId).maybeSingle();
  if (!u || !u.is_demo || u.role !== "user") return NextResponse.redirect(new URL("/guide", url));
  await setSession({ uid: u.id, role: "user" });
  const safe = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") && !to.startsWith("/admin");
  return NextResponse.redirect(new URL(safe ? to : "/", url));
}
