// 해커톤 심사 투어의 지금 상태를 DB에서 읽는다. PC 투어 화면·상태 조회 API·휴대폰 따라보기 화면이 같이 쓴다
import { now } from "./clock";
import { db } from "./supabase";
import { type HumanApp, TOUR_KEY, type TourStepKey, pickTourHuman, tourStep } from "./tour";

export type Tour = { roundId?: string; nextRoundId?: string };

export type TourApp = HumanApp & { user_id: string; realloc_count: number | null; users: { login_id: string; name: string; is_demo: boolean } };

export async function loadTour(): Promise<Tour> {
  const { data } = await db().from("settings").select("value").eq("key", TOUR_KEY).maybeSingle();
  return (data?.value as Tour | null) ?? {};
}

export async function saveTour(v: Tour) {
  await db().from("settings").upsert({ key: TOUR_KEY, value: v }, { onConflict: "key" });
}

/** 회차와 일정, 취소하지 않은 신청 */
export async function roundInfo(id?: string) {
  if (!id) return null;
  const { data: r } = await db().from("rounds").select("id,title,status,match_at,slots(starts_at,ends_at)").eq("id", id).maybeSingle();
  if (!r) return null;
  const slots = ((r as unknown as { slots: { starts_at: string; ends_at: string }[] }).slots ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const { data: apps } = await db().from("applications").select("id,user_id,table_id,match_status,payment_status,attendance_status,realloc_count,users(login_id,name,is_demo)").eq("round_id", id).neq("application_status", "CANCELED");
  return { ...r, slots, apps: (apps ?? []) as unknown as TourApp[] };
}

export type RoundInfo = NonNullable<Awaited<ReturnType<typeof roundInfo>>>;

/** 휴대폰으로 로그인할 시연 사람 계정 한 명 (/guide와 같은 기준) */
export async function tourHuman(): Promise<{ id: string; login_id: string; name: string } | null> {
  const { data } = await db().from("users").select("id,login_id,name,role,is_demo").eq("is_demo", true).eq("role", "user").not("login_id", "like", "test-%").is("deleted_at", null).order("login_id").limit(5);
  const h = pickTourHuman(data ?? []);
  return h ? { id: h.id, login_id: h.login_id, name: h.name } : null;
}

/** 지금 투어 단계와 두 회차 */
export async function tourSnapshot() {
  const t = await now();
  const tour = await loadTour();
  const [cur, next] = await Promise.all([roundInfo(tour.roundId), roundInfo(tour.nextRoundId)]);
  const paid = cur?.apps.filter((a) => a.payment_status === "PAID").length ?? 0;
  const step: TourStepKey = tourStep({
    hasRound: !!cur,
    roundStatus: cur?.status ?? null,
    paid,
    firstStart: cur?.slots[0]?.starts_at ?? null,
    lastEnd: cur?.slots.length ? cur.slots.reduce((x, s) => (s.ends_at > x ? s.ends_at : x), cur.slots[0].ends_at) : null,
    hasNext: !!next,
    nextApps: next?.apps.length ?? 0,
    nextStatus: next?.status ?? null,
    t,
  });
  return { t, tour, cur, next, paid, step };
}
