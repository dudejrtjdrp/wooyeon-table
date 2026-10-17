import { redirect } from "next/navigation";
import { AuthChooser } from "@/components/auth-chooser";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { now } from "@/lib/clock";
import { fmtSlot } from "@/lib/format";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; m?: string; next?: string }> }) {
  const { e, m, next: raw } = await searchParams;
  // 우리 사이트 안 경로만 이어 간다 ('//다른사이트'로 빠지지 않게)
  const next = raw?.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : undefined;
  if (await getSession()) redirect(next ?? "/");
  // 첫 화면과 같이 가장 가까운 모임 시각을 보여 준다
  const { data: soon } = await db().from("slots").select("starts_at,rounds!inner(status,apply_deadline)").eq("rounds.status", "open").gt("rounds.apply_deadline", (await now()).toISOString()).order("starts_at").limit(1);
  return <AuthChooser next={next} error={e} notice={m} upcoming={soon?.[0] ? fmtSlot(soon[0].starts_at) : null} />;
}
