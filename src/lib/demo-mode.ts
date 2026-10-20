// 시연 안내를 보여 줄지: 시연 계정(users.is_demo)으로 로그인했을 때만.
// 시연 시계를 옮긴 것만으로는 보이지 않는다(로그인 전 방문자·실제 회원에게 운영자 화면 링크가 보이지 않게)
import { db } from "./supabase";

export function isDemoMode(o: { offsetSeconds: number | null | undefined; demoUser?: boolean | null }): boolean {
  return o.demoUser === true;
}

export async function demoMode(userId?: string | null): Promise<boolean> {
  const [{ data: clock }, user] = await Promise.all([
    db().from("app_clock").select("offset_seconds").eq("id", 1).maybeSingle(),
    userId ? db().from("users").select("is_demo").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return isDemoMode({ offsetSeconds: clock?.offset_seconds, demoUser: (user.data as { is_demo?: boolean } | null)?.is_demo });
}
