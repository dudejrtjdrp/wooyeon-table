import { requireAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { addVenue, createRound } from "./actions";

export const dynamic = "force-dynamic";

const input = "rounded-lg border border-line bg-white px-3 py-2 text-[14px]";

export default async function Rounds({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin();
  const { e } = await searchParams;
  const { data: rounds } = await db().from("rounds").select("id,title,status,apply_deadline,match_at,slots(id,region,starts_at,max_tables)").order("match_at");
  const { data: venues } = await db().from("venues").select("id,name,region,address,price_range,active").order("region");

  return (
    <div>
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">회차·식당</h1>
      {e && <p className="mt-3 rounded-xl bg-danger/10 px-4 py-2 text-[14px] text-danger">{e}</p>}

      <section className="mt-6 space-y-3">
        {rounds?.map((r) => {
          const dates = [...new Set(r.slots.map((s) => s.starts_at))].sort();
          const regions = [...new Set(r.slots.map((s) => s.region))];
          return (
            <div key={r.id} className="rounded-2xl bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-[16px] font-semibold">{r.title}</p>
                <span className="text-[13px] text-muted">{r.status}</span>
              </div>
              <p className="mt-1 text-[13px] text-muted">신청 마감·자동 매칭 {fmtDateTime(r.match_at)}</p>
              <p className="mt-2 text-[14px]">{dates.map((d) => `${fmtDate(d)} ${fmtTime(d)}`).join(" / ")}</p>
              <p className="text-[14px] text-muted">{regions.join(" · ")} · 일정당 최대 {r.slots[0]?.max_tables ?? 0}테이블</p>
            </div>
          );
        })}
      </section>

      <form action={createRound} className="mt-8 rounded-2xl bg-card p-5">
        <h2 className="text-[16px] font-semibold">새 회차 만들기</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="title" placeholder="예: 11월 둘째 주 저녁" className={input} />
          <label className="text-[13px] text-muted">신청 마감·자동 매칭 시각 <input name="deadline" type="datetime-local" className={`${input} ml-2`} /></label>
          <div className="flex gap-2"><input name="dates" type="date" className={input} /><input name="dates" type="date" className={input} /></div>
          <label className="text-[13px] text-muted">시작 시각 <input name="time" type="time" defaultValue="19:30" className={`${input} ml-2`} /></label>
          <div className="flex flex-wrap gap-3 text-[14px]">
            {REGIONS.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" name="regions" value={r} defaultChecked /> {r}</label>)}
          </div>
          <label className="text-[13px] text-muted">일정당 최대 테이블 <input name="max_tables" type="number" defaultValue={4} min={1} className={`${input} ml-2 w-20`} /></label>
        </div>
        <button className="mt-4 h-10 rounded-xl bg-accent px-4 text-[14px] font-semibold text-white">만들기</button>
      </form>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold">제휴 식당</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-card">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[12px] text-muted"><tr>{["지역", "식당", "주소", "가격대"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {venues?.map((v) => (
                <tr key={v.id}><td className="px-3 py-2">{v.region}</td><td className="px-3 py-2">{v.name}</td><td className="px-3 py-2 text-muted">{v.address}</td><td className="px-3 py-2">{v.price_range}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addVenue} className="mt-3 flex flex-wrap gap-2">
          <select name="region" className={input}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input name="name" placeholder="식당 이름" className={input} />
          <input name="address" placeholder="주소" className={`${input} min-w-60 flex-1`} />
          <input name="price" placeholder="가격대" className={`${input} w-28`} />
          <button className="h-10 rounded-xl bg-accent px-4 text-[14px] font-semibold text-white">식당 추가</button>
        </form>
        <p className="mt-2 text-[12px] text-muted">추가한 식당은 모집 중인 같은 지역 일정마다 2테이블씩 받을 수 있게 잡혀요.</p>
      </section>
    </div>
  );
}
