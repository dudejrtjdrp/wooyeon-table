// 지금 심사 시연 중인지: 시연 시계를 옮겼거나(app_clock offset ≠ 0), 시연 계정(users.is_demo)으로 들어온 경우.
// 실제 회원에게는 시연 안내를 보여 주지 않는다
import { db } from "./supabase";

export function isDemoMode(o: { offsetSeconds: number | null | undefined; demoUser?: boolean | null }): boolean {
  return Number(o.offsetSeconds ?? 0) !== 0 || o.demoUser === true;
}

export async function demoMode(userId?: string | null): Promise<boolean> {
  const [{ data: clock }, user] = await Promise.all([
    db().from("app_clock").select("offset_seconds").eq("id", 1).maybeSingle(),
    userId ? db().from("users").select("is_demo").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return isDemoMode({ offsetSeconds: clock?.offset_seconds, demoUser: (user.data as { is_demo?: boolean } | null)?.is_demo });
}
