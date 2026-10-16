import { redirect } from "next/navigation";
import { AuthChooser } from "@/components/auth-chooser";
import { getSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; m?: string; next?: string }> }) {
  const { e, m, next: raw } = await searchParams;
  // 우리 사이트 안 경로만 이어 간다 ('//다른사이트'로 빠지지 않게)
  const next = raw?.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : undefined;
  if (await getSession()) redirect(next ?? "/");
  return <AuthChooser next={next} error={e} notice={m} />;
}
