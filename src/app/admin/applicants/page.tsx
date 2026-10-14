import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Applicants({ searchParams }: { searchParams: Promise<{ r?: string; s?: string }> }) {
  await requireAdmin();
  const { r, s } = await searchParams;
  const { data: rounds } = await db().from("rounds").select("id,title").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.[0];
  let q = db()
    .from("applications")
    .select("id,payment_status,match_status,attendance_status,realloc_count,submitted_at,resolution,users(name,login_id,account_status,profiles(birth_year,gender,mbti,job)),payments(amount,status),application_slots(slots(region))")
    .eq("round_id", round?.id ?? "")
    .order("submitted_at", { ascending: false });
  if (s) q = q.eq("match_status", s);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; payment_status: string; match_status: string; attendance_status: string | null; realloc_count: number; submitted_at: string; resolution: string | null;
    users: { name: string; login_id: string; account_status: string; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null };
    payments: { amount: number; status: string } | null; application_slots: { slots: { region: string } }[];
  }[];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[24px] font-bold">신청자·결제</h1>
        <div className="flex gap-2">
          <form className="flex gap-2">
            <select name="r" defaultValue={round?.id} className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">
              {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <select name="s" defaultValue={s ?? ""} className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">
              <option value="">전체 상태</option>
              {["WAITING", "CONFIRMED", "ALTERNATIVE_OFFERED", "TRANSFERRED", "NO_MATCH", "EXCEPTION"].map((x) => <option key={x}>{x}</option>)}
            </select>
            <button className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">보기</button>
          </form>
          {round && <a href={`/api/admin/export?r=${round.id}`} className="rounded-lg bg-ink px-3 py-2 text-[14px] text-white">CSV 내려받기</a>}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-[13px]">
          <thead className="bg-line/40 text-left text-muted">
            <tr>{["이름", "프로필", "희망 동네", "결제", "매칭", "참석", "재배치", "신청 시각"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">{a.users.name}{a.users.account_status !== "active" && <span className="ml-1 text-accent">({a.users.account_status})</span>}</td>
                <td className="px-3 py-2 text-muted">{a.users.profiles?.birth_year} {a.users.profiles?.gender === "M" ? "남" : "여"} {a.users.profiles?.mbti} {a.users.profiles?.job}</td>
                <td className="px-3 py-2">{[...new Set(a.application_slots.map((x) => x.slots.region))].join(", ")}</td>
                <td className="px-3 py-2">{a.payment_status}</td>
                <td className="px-3 py-2">{a.match_status}{a.resolution ? ` (${a.resolution})` : ""}</td>
                <td className="px-3 py-2">{a.attendance_status ?? "-"}</td>
                <td className="px-3 py-2">{a.realloc_count || "-"}</td>
                <td className="px-3 py-2 text-muted">{a.submitted_at ? fmtDateTime(a.submitted_at) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-muted">신청자가 없어요.</p>}
      </div>
    </div>
  );
}
