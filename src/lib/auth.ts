import { redirect } from "next/navigation";
import { db } from "./supabase";
import { getSession } from "./session";

export interface Me {
  id: string;
  name: string;
  role: "user" | "admin";
  login_id: string;
  phone: string | null;
  account_status: string;
  hasProfile: boolean;
  email: string | null;
  avatar_url: string | null;
}

export async function getMe(): Promise<Me | null> {
  const s = await getSession();
  if (!s) return null;
  const { data } = await db()
    .from("users")
    .select("id,name,role,login_id,phone,account_status,email,avatar_url,profiles(user_id)")
    .eq("id", s.uid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const prof = (data as { profiles: unknown }).profiles;
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    login_id: data.login_id,
    phone: data.phone,
    account_status: data.account_status,
    hasProfile: Array.isArray(prof) ? prof.length > 0 : Boolean(prof),
    email: (data as { email?: string | null }).email ?? null,
    avatar_url: (data as { avatar_url?: string | null }).avatar_url ?? null,
  };
}

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  return me;
}

export async function requireProfile(): Promise<Me> {
  const me = await requireMe();
  if (!me.hasProfile) redirect("/onboarding");
  return me;
}

export async function requireAdmin(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== "admin") redirect("/admin/login");
  return me;
}
