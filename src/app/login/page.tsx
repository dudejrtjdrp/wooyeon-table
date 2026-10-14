import { redirect } from "next/navigation";
import { AuthChooser } from "@/components/auth-chooser";
import { getSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; m?: string; next?: string }> }) {
  const { e, m, next } = await searchParams;
  if (await getSession()) redirect(next?.startsWith("/") ? next : "/");
  return <AuthChooser next={next} error={e} notice={m} />;
}
