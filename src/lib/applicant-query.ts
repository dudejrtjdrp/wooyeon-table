// 신청자 목록 읽기 (화면·CSV 공통). 거르기 판단은 applicant-filter.ts, 여기서는 읽어서 이전 이력을 붙인다
import { type ApplicantFilter, type ApplicantHistory, applicantDbFilter, applicantMatches } from "./applicant-filter";
import { db } from "./supabase";

const COLS =
  "id,user_id,payment_status,match_status,attendance_status,realloc_count,submitted_at,resolution,application_status,table_id,users(name,login_id,account_status,profiles(birth_year,gender,mbti,job)),payments(amount,status),application_slots(slots(region)),dining_tables(score,slots(region,starts_at),venues(name))";

export interface ApplicantRow {
  id: string; user_id: string; payment_status: string; match_status: string; attendance_status: string | null; realloc_count: number; submitted_at: string; resolution: string | null; application_status: string; table_id: string | null;
  users: { name: string; login_id: string; account_status: string; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null };
  payments: { amount: number; status: string } | null;
  application_slots: { slots: { region: string } }[];
  dining_tables: { score: number; slots: { region: string; starts_at: string }; venues: { name: string } | null } | null;
}

/** 회차 하나의 신청을 거르기대로. 이전 참석·노쇼는 다른 회차 기록, 신고는 받은 신고 전체 */
export async function loadApplicants(f: ApplicantFilter, roundId: string): Promise<{ rows: ApplicantRow[]; history: Map<string, ApplicantHistory> }> {
  const c = applicantDbFilter(f);
  let q = db().from("applications").select(COLS).eq("round_id", roundId).order("submitted_at", { ascending: false });
  if (c.matchEq) q = q.eq("match_status", c.matchEq);
  if (c.appStatusEq) q = q.eq("application_status", c.appStatusEq);
  if (c.payEq) q = q.eq("payment_status", c.payEq);
  if (c.attEq) q = q.eq("attendance_status", c.attEq);
  if (c.attNull) q = q.is("attendance_status", null);
  const { data } = await q;
  const all = (data ?? []) as unknown as ApplicantRow[];

  const uids = [...new Set(all.map((a) => a.user_id))];
  const history = new Map<string, ApplicantHistory>(uids.map((u) => [u, { attended: 0, noShows: 0, reports: 0 }]));
  // in 조건 주소가 너무 길어지지 않게 200명씩
  for (let i = 0; i < uids.length; i += 200) {
    const chunk = uids.slice(i, i + 200);
    const [{ data: past }, { data: reps }] = await Promise.all([
      db().from("applications").select("user_id,attendance_status").in("user_id", chunk).in("attendance_status", ["ATTENDED", "NO_SHOW"]).neq("round_id", roundId),
      db().from("safety_reports").select("reported_id").in("reported_id", chunk),
    ]);
    for (const x of past ?? []) {
      const h = history.get(x.user_id as string)!;
      if (x.attendance_status === "ATTENDED") h.attended++;
      else h.noShows++;
    }
    for (const x of reps ?? []) history.get(x.reported_id as string)!.reports++;
  }
  const rows = all.filter((a) => applicantMatches(a, f, history.get(a.user_id)!));
  return { rows, history };
}
