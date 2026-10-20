import { db } from "./supabase";

// 시연용 가상 시각. 서버가 보는 "지금"을 app_clock.offset_seconds만큼 앞당긴다.
// 실제 운영에서는 offset이 0이라 진짜 현재 시각과 같다.
export async function now(): Promise<Date> {
  const { data } = await db().from("app_clock").select("offset_seconds").eq("id", 1).single();
  const offset = Number(data?.offset_seconds ?? 0);
  return new Date(Date.now() + offset * 1000);
}

/**
 * 실제 시각. 예외 큐의 생성·해결 시각(created_at·resolved_at)과 감사 로그(status_events.created_at)는
 * DB 기본값처럼 실제로 일이 일어난 시각으로 남긴다. 그래야 시연 시계를 옮겨도 '예외 처리 시간' 지표가 늘어나지 않는다
 */
export function realNowIso(): string {
  return new Date().toISOString();
}
