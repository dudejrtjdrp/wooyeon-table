import Link from "next/link";
import { Badge, PageHeader, btnLight, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate } from "@/lib/format";
import { ACCOUNT, ageBand, label } from "@/lib/labels";
import { escapeLike, maskPhone, parseMemberQuery } from "@/lib/members";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  id: string; name: string; login_id: string; phone: string | null; account_status: string; created_at: string; deleted_at: string | null;
  profiles: { birth_year: number; gender: string } | { birth_year: number; gender: string }[] | null;
};
const COLS = "id,name,login_id,phone,account_status,created_at,deleted_at,profiles(birth_year,gender)";

export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q: raw } = await searchParams;
  const query = parseMemberQuery(raw);
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(await now()));

  // 이름·로그인 ID는 따로 찾아 합친다 (.or()에 검색어를 넣으면 쉼표·괄호가 문법으로 읽힌다)
  const base = () => db().from("users").select(COLS).eq("role", "user").order("created_at", { ascending: false }).limit(50);
  let rows: Row[] = [];
  if (query.kind === "phone4") rows = ((await base().like("phone", `%${query.digits}`)).data ?? []) as unknown as Row[];
  else if (query.kind === "phone") rows = ((await base().eq("phone", query.digits)).data ?? []) as unknown as Row[];
  else if (query.kind === "text") {
    const pat = `%${escapeLike(query.text)}%`;
    const [byName, byLogin] = await Promise.all([base().ilike("name", pat), base().ilike("login_id", pat)]);
    const seen = new Map<string, Row>();
    for (const r of [...((byName.data ?? []) as unknown as Row[]), ...((byLogin.data ?? []) as unknown as Row[])]) seen.set(r.id, r);
    rows = [...seen.values()];
  }

  const ids = rows.map((r) => r.id);
  const { data: apps } = ids.length ? await db().from("applications").select("user_id,attendance_status").in("user_id", ids) : { data: [] };
  const appN = new Map<string, number>();
  const attN = new Map<string, number>();
  for (const a of apps ?? []) {
    appN.set(a.user_id, (appN.get(a.user_id) ?? 0) + 1);
    if (a.attendance_status === "ATTENDED") attN.set(a.user_id, (attN.get(a.user_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader title="회원 찾기" desc="회차와 상관없이 이름, 연락처 뒤 4자리, 로그인 ID로 찾아요. 연락처는 가려서 보여요." />
      <form className="mt-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={raw ?? ""} placeholder="이름, 연락처 뒤 4자리, 로그인 ID" aria-label="회원 검색어" className={`${ctl} w-72`} autoFocus />
        <button className={btnLight}>찾기</button>
      </form>

      {query.kind === "empty" ? (
        <p className="mt-6 rounded-[20px] bg-card p-10 text-center text-muted shadow-card">
          {raw?.trim() ? "두 글자 이상 적어 주세요. 연락처는 뒤 4자리만 적어도 돼요." : "찾을 회원의 이름이나 연락처 뒤 4자리를 적어 주세요."}
        </p>
      ) : (
        <div className="mt-3 shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead className="border-b border-line">
              <tr>{["이름", "로그인 ID", "연락처", "프로필", "계정", "신청", "참석", "가입"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => {
                const p = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
                return (
                  <tr key={u.id} className="hover:bg-paper/60">
                    <td className={td}>
                      <Link href={`/admin/members/${u.id}`} className="inline-flex min-h-11 items-center text-[16px] font-bold text-ink hover:text-accent">{u.name}</Link>
                      {u.deleted_at && <span className="ml-2"><Badge v={["탈퇴", "muted"]} /></span>}
                    </td>
                    <td className={`${td} text-[#4c5368]`}>{u.login_id}</td>
                    <td className={`${td} tabular-nums`}>{maskPhone(u.phone)}</td>
                    <td className={`${td} text-[#4c5368]`}>{p ? `${ageBand(p.birth_year, year)} · ${p.gender === "M" ? "남" : "여"}` : "프로필 없음"}</td>
                    <td className={td}><Badge v={label(ACCOUNT, u.account_status)} /></td>
                    <td className={`${td} tabular-nums`}>{appN.get(u.id) ? `${appN.get(u.id)}건` : <span className="text-muted">없음</span>}</td>
                    <td className={`${td} tabular-nums`}>{attN.get(u.id) ? `${attN.get(u.id)}번` : <span className="text-muted">-</span>}</td>
                    <td className={`${td} text-muted`}>{fmtDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="p-10 text-center text-muted">맞는 회원이 없어요. 이름 일부나 연락처 뒤 4자리로 다시 찾아보세요.</p>}
          {rows.length > 0 && <p className="border-t border-line px-4 py-3 text-[14px] text-muted">{rows.length}명{rows.length >= 50 ? " (50명까지 보여요. 더 좁혀 찾아 주세요)" : ""}</p>}
        </div>
      )}
    </div>
  );
}
