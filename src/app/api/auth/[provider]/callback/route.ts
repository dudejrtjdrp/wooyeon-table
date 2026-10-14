import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, isProvider, type OAuthProfile, type Provider } from "@/lib/oauth";
import { CONFIG } from "@/lib/oauth";
import { setSession } from "@/lib/session";
import { db } from "@/lib/supabase";

/** 제공자 계정을 우리 회원과 이어 준다. 처음이면 회원을 새로 만든다 */
async function upsertUser(p: Provider, prof: OAuthProfile) {
  const now = new Date().toISOString();
  const { data: ident } = await db()
    .from("user_identities")
    .select("user_id")
    .eq("provider", p)
    .eq("provider_user_id", prof.id)
    .maybeSingle();
  if (ident) {
    await db().from("user_identities").update({ last_login_at: now, email: prof.email }).eq("provider", p).eq("provider_user_id", prof.id);
    const { data: u } = await db().from("users").select("id,role,account_status,avatar_url").eq("id", ident.user_id).single();
    await db().from("users").update({ last_login_at: now, avatar_url: u?.avatar_url ?? prof.avatar }).eq("id", ident.user_id);
    return { user: u!, isNew: false };
  }
  const { data: user, error } = await db()
    .from("users")
    .insert({
      login_id: `${p}:${prof.id}`,
      name: prof.name?.trim() || `${CONFIG[p].label} 사용자`,
      email: prof.email,
      avatar_url: prof.avatar,
      phone: prof.phone,
      last_login_at: now,
    })
    .select("id,role,account_status,avatar_url")
    .single();
  if (error || !user) throw new Error(`회원 생성 실패: ${error?.message}`);
  await db().from("user_identities").insert({ provider: p, provider_user_id: prof.id, user_id: user.id, email: prof.email });
  return { user, isNew: true };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = req.nextUrl.origin;
  const fail = (m: string) => {
    const res = NextResponse.redirect(new URL(`/login?e=${encodeURIComponent(m)}`, origin));
    res.cookies.delete("wt_oauth");
    return res;
  };
  if (!isProvider(provider)) return fail("지원하지 않는 로그인 방식이에요");

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail("로그인을 취소했어요");
  let saved: { state: string; provider: string; next: string } | null = null;
  try {
    saved = JSON.parse(req.cookies.get("wt_oauth")?.value ?? "null");
  } catch {}
  const code = sp.get("code");
  const state = sp.get("state") ?? "";
  if (!code || !saved || saved.state !== state || saved.provider !== provider) {
    return fail("로그인 시간이 지났어요. 다시 시도해 주세요");
  }

  try {
    const token = await exchangeCode(provider, origin, code, state);
    const prof = await CONFIG[provider].fetchProfile(token);
    const { user, isNew } = await upsertUser(provider, prof);
    if (user.account_status === "banned") return fail("이용이 제한된 계정이에요. 운영팀에 문의해 주세요");
    await setSession({ uid: user.id, role: user.role });

    // 처음 들어온 사람은 제공자가 준 정보(출생연도·성별)를 들고 프로필 입력으로 간다
    const { data: profile } = await db().from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    let dest = user.role === "admin" ? "/admin" : saved.next;
    if (!profile && user.role !== "admin") {
      const q = new URLSearchParams();
      if (isNew) q.set("welcome", "1");
      if (prof.birthYear) q.set("by", String(prof.birthYear));
      if (prof.gender) q.set("g", prof.gender);
      dest = `/onboarding${q.size ? `?${q}` : ""}`;
    }
    const res = NextResponse.redirect(new URL(dest, origin));
    res.cookies.delete("wt_oauth");
    return res;
  } catch (e) {
    console.error(`[oauth:${provider}]`, e);
    return fail(`${CONFIG[provider].label} 로그인 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요`);
  }
}
