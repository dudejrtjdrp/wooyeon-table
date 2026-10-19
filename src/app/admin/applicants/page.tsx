import { isBot } from "@/lib/sim/persona-id";
import { Download } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, TableScroll, Term, btn, btnLight, ctl, table, td, tdNowrap, th } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { ATTEND_NONE, type ApplicantHistory, HISTORY, MATCH_EXTRA, applicantFiltered, applicantSearch, parseApplicantFilter } from "@/lib/applicant-filter";
import { type ApplicantRow, loadApplicants } from "@/lib/applicant-query";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { now } from "@/lib/clock";
import { ACCOUNT, ATTEND, MATCH, PAYMENT, RESOLUTION, ageBand, label } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Applicants({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const f = parseApplicantFilter(await searchParams);
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(await now()));
  const { data: rounds } = await db().from("rounds").select("id,title").order("match_at");
  const round = rounds?.find((x) => x.id === f.r) ?? rounds?.[0];
  const [{ rows, history }, { data: slots }] = await Promise.all([
    round ? loadApplicants(f, round.id) : Promise.resolve({ rows: [] as ApplicantRow[], history: new Map<string, ApplicantHistory>() }),
    db().from("slots").select("region").eq("round_id", round?.id ?? ""),
  ]);
  const regions = [...new Set((slots ?? []).map((x) => x.region as string))].sort((a, b) => a.localeCompare(b, "ko"));
  // 고른 동네가 이 회차에 없더라도 고른 값은 보이게 둔다
  if (f.region && !regions.includes(f.region)) regions.push(f.region);
  const filtered = applicantFiltered(f);
  const here = round ? { ...f, r: round.id } : f;

  return (
    <div>
      <PageHeader
        title="신청자·결제"
        desc={<>한 <Term tip={TIP.회차}>회차</Term>의 신청자를 봐요. 목록에는 연령대만 보이고, 연락처는 상세 화면에서 가려서 보여요.</>}
        how={["회차와 조건을 고르고 '조건으로 찾기'", "이름을 눌러 상태 이력·받은 알림·참가 기록 보기", "필요하면 찾은 목록을 CSV로 내려받기"]}
        actions={round && <a href={`/api/admin/export${applicantSearch(here)}`} className={btnLight} download><Download size={18} />{filtered ? "찾은 목록 CSV" : "CSV 내려받기"}</a>}
      />
      <form className="shadow-card mt-6 grid gap-3 rounded-[20px] bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">회차</span>
          <select name="r" defaultValue={round?.id} className={`${ctl} mt-1.5 w-full`}>
            {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">희망 동네</span>
          <select name="region" defaultValue={f.region ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 동네</option>
            {regions.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">결제</span>
          <select name="pay" defaultValue={f.pay ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 결제 상태</option>
            {Object.entries(PAYMENT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">매칭</span>
          <select name="s" defaultValue={f.s ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 매칭 상태</option>
            {Object.entries(MATCH_EXTRA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            {Object.entries(MATCH).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">참석</span>
          <select name="att" defaultValue={f.att ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">모든 참석 상태</option>
            <option value={ATTEND_NONE}>아직 없음</option>
            {Object.entries(ATTEND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">이전 이력</span>
          <select name="hist" defaultValue={f.hist ?? ""} className={`${ctl} mt-1.5 w-full`}>
            <option value="">상관없음</option>
            {HISTORY.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">검색</span>
          <input type="search" name="q" defaultValue={f.q ?? ""} placeholder="이름이나 아이디" className={`${ctl} mt-1.5 w-full`} />
        </label>
        <div className="flex items-end gap-2">
          <button className={`${btn} whitespace-nowrap bg-accent text-white`}>조건으로 찾기</button>
          {filtered && round && <Link href={`/admin/applicants?r=${round.id}`} className={`${btnLight} whitespace-nowrap`}>조건 풀기</Link>}
        </div>
      </form>
      <p className="mt-5 text-[13px] text-muted">이전 참석·노쇼는 이번 회차를 뺀 기록이에요. 고른 조건은 주소에 남아서, 주소를 그대로 보내면 같은 목록이 열려요.</p>

      <TableScroll className="shadow-card mt-2 rounded-[20px] bg-card" label="신청자 표">
        <table className={`${table} min-w-[1040px]`}>
          <thead className="border-b border-line">
            <tr>{["이름", "프로필", "희망 동네", "결제", "매칭", "참석", "이전 참석·노쇼", "받은 신고", "신청 시각"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const p = a.users.profiles;
              const h = history.get(a.user_id) ?? { attended: 0, noShows: 0, reports: 0 };
              return (
                <tr key={a.id} className="hover:bg-paper/60">
                  <td className={tdNowrap}>
                    <Link href={`/admin/applicants/${a.id}`} className="text-[16px] font-bold text-ink hover:text-accent">{a.users.name}</Link>
                    {a.users.is_demo && <span title={isBot(a.users) ? "시연용 봇 계정이에요(시연 패널에서 켜고 끔)" : "시연용 계정이에요"} className="ml-1.5 rounded-full bg-field px-2 py-0.5 text-[11px] font-semibold text-muted">{isBot(a.users) ? "시연 봇" : "시연"}</span>}
                    {a.users.account_status !== "active" && <span className="ml-2"><Badge v={label(ACCOUNT, a.users.account_status)} /></span>}
                  </td>
                  <td className={`${td} min-w-[180px] text-[#4c5368]`}>{p ? <><span className="block whitespace-nowrap">{ageBand(p.birth_year, year)} · {p.gender === "M" ? "남" : "여"}{p.mbti ? ` · ${p.mbti}` : ""}</span>{p.job && <span className="block text-[12px] text-muted">{p.job}</span>}</> : "-"}</td>
                  <td className={`${td} min-w-[180px]`}>
                    {/* 동네 이름(잠실·송파) 안에서는 줄을 바꾸지 않고, 동네와 동네 사이에서만 바꾼다 */}
                    {[...new Set(a.application_slots.map((x) => x.slots.region))].map((r, i) => <span key={r}>{i > 0 && " · "}<span className="whitespace-nowrap">{r}</span></span>)}
                  </td>
                  <td className={tdNowrap}><Badge v={label(PAYMENT, a.payment_status)} /></td>
                  <td className={`${td} min-w-[120px]`}>
                    {a.application_status === "CANCELED" ? <Badge v={["신청 취소", "muted"]} /> : <Badge v={label(MATCH, a.match_status)} />}
                    {/* 덧붙는 말은 배지 아래 줄로(배지 옆에 붙이면 칸이 좁을 때 배지와 섞여 깨진다) */}
                    {a.realloc_count > 0 && <span className="mt-1 block whitespace-nowrap text-[12px] text-muted">재배치 {a.realloc_count}번</span>}
                    {a.resolution && RESOLUTION[a.resolution] && <span className="mt-1 block whitespace-nowrap text-[12px] text-muted">{RESOLUTION[a.resolution]}</span>}
                  </td>
                  <td className={tdNowrap}>{a.attendance_status ? <Badge v={label(ATTEND, a.attendance_status)} /> : <span className="text-muted">-</span>}</td>
                  <td className={`${tdNowrap} tabular-nums`}>
                    {h.attended ? `${h.attended}번` : <span className="text-muted">{h.noShows ? "0번" : "처음"}</span>}
                    {h.noShows > 0 && <span className="ml-1.5"><Badge v={[`노쇼 ${h.noShows}번`, "danger"]} /></span>}
                  </td>
                  <td className={tdNowrap}>{h.reports ? <Badge v={[`${h.reports}건`, "danger"]} /> : <span className="text-muted">-</span>}</td>
                  <td className={`${tdNowrap} text-muted`}>{a.submitted_at ? fmtDateTime(a.submitted_at) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-muted">{filtered ? "조건에 맞는 신청자가 없어요. 조건을 풀어 보세요." : "아직 이 회차에 신청한 사람이 없어요. 신청이 들어오면 여기에 바로 보여요."}</p>}
        <p className="border-t border-line px-4 py-3 text-[14px] text-muted">{filtered ? "찾은 결과" : "총"} {rows.length}명</p>
      </TableScroll>
    </div>
  );
}
