import { redirect } from "next/navigation";
import { AuthChooser } from "@/components/auth-chooser";
import { getSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  if (await getSession()) redirect(next?.startsWith("/") ? next : "/");
  return <AuthChooser next={next} error={e} />;
}
