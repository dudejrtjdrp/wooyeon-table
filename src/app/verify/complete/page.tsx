import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { confirmIdentity } from "@/lib/identity";

// 모바일에서는 PASS 인증 뒤 이 주소로 돌아온다
export default async function VerifyComplete({
  searchParams,
}: {
  searchParams: Promise<{ identityVerificationId?: string; code?: string; message?: string; next?: string }>;
}) {
  const me = await requireMe();
  const { identityVerificationId, code, next } = await searchParams;
  const back = `/onboarding?next=${encodeURIComponent(next ?? "/")}`;
  if (code || !identityVerificationId) redirect(`${back}&e=${encodeURIComponent("본인인증을 마치지 않았어요")}`);
  const r = await confirmIdentity(me.id, identityVerificationId!);
  redirect(r.ok ? `${back}&verified=1` : `${back}&e=${encodeURIComponent(r.error)}`);
}
