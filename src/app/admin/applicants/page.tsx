import Link from "next/link";
import { Badge, PageHeader, btnInk, btnLight, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { ACCOUNT, ATTEND, MATCH, PAYMENT, RESOLUTION, label } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Applicants({ searchParams }: { searchParams: Promise<{ r?: string; s?: string; q?: string }> }) {
  await requireAdmin();
  const { r, s, q: query } = await searchParams;
  const { data: rounds } = await db().from("rounds").select("id,title").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.[0];
  let q = db()
    .from("applications")
    .select("id,user_id,payment_status,match_status,attendance_status,realloc_count,submitted_at,resolution,application_status,users(name,login_id,account_status,profiles(birth_year,gender,mbti,job)),payments(amount,status),application_slots(slots(region))")
    .eq("round_id", round?.id ?? "")
    .order("submitted_at", { ascending: false });
  if (s) q = q.eq("match_status", s);
  const { data } = await q;
  let rows = (data ?? []) as unknown as {
    id: string; user_id: string; payment_status: string; match_status: string; attendance_status: string | null; realloc_count: number; submitted_at: string; resolution: string | null; application_status: string;
    users: { name: string; login_id: string; account_status: string; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null };
    payments: { amount: number; status: string } | null; application_slots: { slots: { region: string } }[];
  }[];
  if (query) rows = rows.filter((a) => a.users.name.includes(query) || a.users.login_id.includes(query));
  // 이전 참석·신고 이력 (11장 신청자 목록)
  const uids = rows.map((a) => a.user_id);
  const [{ data: att }, { data: reps }] = uids.length
    ? await Promise.all([
        db().from("applications").select("user_id").in("user_id", uids).eq("attendance_status", "ATTENDED").neq("round_id", round?.id ?? ""),
        db().from("safety_reports").select("reported_id").in("reported_id", uids),
      ])
    : [{ data: [] }, { data: [] }];
  const attN = new Map<string, number>();
  for (const x of att ?? []) attN.set(x.user_id, (attN.get(x.user_id) ?? 0) + 1);
  const repN = new Map<string, number>();
  for (const x of reps ?? []) repN.set(x.reported_id, (repN.get(x.reported_id) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        title="신청자·결제"
        desc="이름을 누르면 그 사람의 상태 이력, 받은 알림, 참가 기록을 한 화면에서 볼 수 있어요."
        actions={round && <a href={`/api/admin/export?r=${round.id}`} className={btnInk}>CSV 내려받기</a>}
      />
      <form className="mt-6 flex flex-wrap gap-2">
        <select name="r" defaultValue={round?.id} className={ctl}>
          {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <select name="s" defaultValue={s ?? ""} className={ctl}>
          <option value="">모든 매칭 상태</option>
          {Object.entries(MATCH).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input name="q" defaultValue={query ?? ""} placeholder="이름이나 아이디로 찾기" className={`${ctl} w-56`} />
        <button className={btnLight}>보기</button>
      </form>

      <p className="mt-4 text-[13px] text-muted">{rows.length}명</p>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-card">
        <table className="w-full min-w-[1040px] text-[14px]">
          <thead className="border-b border-line">
            <tr>{["이름", "프로필", "희망 동네", "결제", "매칭", "참석", "이전 참석", "받은 신고", "신청 시각"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const p = a.users.profiles;
              return (
                <tr key={a.id} className="hover:bg-paper/60">
                  <td className={td}>
                    <Link href={`/admin/applicants/${a.id}`} className="font-semibold text-accent hover:underline">{a.users.name}</Link>
                    {a.users.account_status !== "active" && <span className="ml-2"><Badge v={label(ACCOUNT, a.users.account_status)} /></span>}
                  </td>
                  <td className={`${td} text-muted`}>{p ? `${p.birth_year}년생 ${p.gender === "M" ? "남" : "여"}${p.mbti ? ` ${p.mbti}` : ""}${p.job ? `, ${p.job}` : ""}` : "-"}</td>
                  <td className={td}>{[...new Set(a.application_slots.map((x) => x.slots.region))].join(", ")}</td>
                  <td className={td}><Badge v={label(PAYMENT, a.payment_status)} /></td>
                  <td className={td}>
                    {a.application_status === "CANCELED" ? <Badge v={["신청 취소", "muted"]} /> : <Badge v={label(MATCH, a.match_status)} />}
                    {a.realloc_count > 0 && <span className="ml-1.5 text-[12px] text-muted">재배치 {a.realloc_count}</span>}
                    {a.resolution && <span className="ml-1.5 text-[12px] text-muted">{RESOLUTION[a.resolution] ?? a.resolution}</span>}
                  </td>
                  <td className={td}>{a.attendance_status ? <Badge v={label(ATTEND, a.attendance_status)} /> : <span className="text-muted">-</span>}</td>
                  <td className={`${td} tabular-nums`}>{attN.get(a.user_id) ? `${attN.get(a.user_id)}번` : <span className="text-muted">처음</span>}</td>
                  <td className={td}>{repN.get(a.user_id) ? <Badge v={[`${repN.get(a.user_id)}건`, "danger"]} /> : <span className="text-muted">-</span>}</td>
                  <td className={`${td} text-muted`}>{a.submitted_at ? fmtDateTime(a.submitted_at) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-muted">조건에 맞는 신청자가 없어요.</p>}
      </div>
    </div>
  );
}
