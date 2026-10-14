import { db } from "./supabase";

// 시연용 가상 시각. 서버가 보는 "지금"을 app_clock.offset_seconds만큼 앞당긴다.
// 실제 운영에서는 offset이 0이라 진짜 현재 시각과 같다.
export async function now(): Promise<Date> {
  const { data } = await db().from("app_clock").select("offset_seconds").eq("id", 1).single();
  const offset = Number(data?.offset_seconds ?? 0);
  return new Date(Date.now() + offset * 1000);
}
