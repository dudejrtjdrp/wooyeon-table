import { Badge, PageHeader, Panel, RoundPicker, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { REGIONS } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { addVenue, createRound, setCapacity } from "./actions";

export const dynamic = "force-dynamic";

const ROUND_STATUS: Record<string, [string, "accent" | "leaf" | "muted" | "candle"]> = { open: ["모집 중", "accent"], matching: ["매칭 중", "candle"], matched: ["매칭 완료", "leaf"], closed: ["종료", "muted"] };

export default async function Rounds({ searchParams }: { searchParams: Promise<{ e?: string; r?: string }> }) {
  await requireAdmin();
  const { e, r } = await searchParams;
  const { rounds: picker, round: cur } = await roundsAndCurrent(r);
  const { data: rounds } = await db().from("rounds").select("id,title,status,apply_deadline,match_at,slots(id,region,starts_at,ends_at,max_tables,application_slots(application_id))").order("match_at");
  const { data: venues } = await db().from("venues").select("id,name,region,address,price_range,active").order("region");
  const { data: inv } = cur ? await db().from("venue_slots").select("venue_id,slot_id,tables_available,slots!inner(round_id)").eq("slots.round_id", cur.id) : { data: [] };
  const { data: used } = cur ? await db().from("dining_tables").select("venue_id,slot_id").eq("round_id", cur.id).neq("status", "DISSOLVED") : { data: [] };
  const curSlots = ((rounds ?? []).find((x) => x.id === cur?.id)?.slots ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.region.localeCompare(b.region));
  const cap = new Map((inv ?? []).map((v) => [`${v.venue_id}:${v.slot_id}`, v.tables_available]));
  const tablesUsed = (vid: string, sid: string) => (used ?? []).filter((u) => u.venue_id === vid && u.slot_id === sid).length;

  return (
    <div>
      <PageHeader title="회차·식당 재고" desc="회차를 만들면 날짜×동네마다 일정이 생기고, 그 동네 제휴 식당이 일정마다 2테이블씩 잡혀요. 테이블 수는 아래 재고 표에서 바꿀 수 있어요." />
      {e && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-2 text-[14px] text-danger">{e}</p>}

      <h2 className="mb-3 mt-8 text-[17px] font-bold">회차</h2>
      <div className="shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead className="border-b border-line"><tr>{["회차", "상태", "신청 마감", "자동 매칭", "일정 (날짜·동네별 신청 수 / 최대 테이블)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(rounds ?? []).map((x) => (
              <tr key={x.id} className="align-top">
                <td className={`${td} font-semibold`}>{x.title}</td>
                <td className={td}><Badge v={ROUND_STATUS[x.status] ?? [x.status, "muted"]} /></td>
                <td className={`${td} text-muted`}>{fmtDateTime(x.apply_deadline)}</td>
                <td className={`${td} text-muted`}>{fmtDateTime(x.match_at)}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1.5">
                    {[...x.slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.region.localeCompare(b.region)).map((s) => (
                      <span key={s.id} className="rounded-lg bg-paper px-2 py-1 text-[12px]">{fmtDate(s.starts_at)} {s.region} <b>{s.application_slots.length}</b>/{s.max_tables}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[17px] font-bold">식당 재고</h2>
        <RoundPicker rounds={picker} current={cur?.id} />
      </div>
      <div className="shadow-card overflow-x-auto rounded-[20px] bg-card px-2 pb-2">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead className="border-b border-line"><tr>{["일정", "식당", "받을 수 있는 테이블", "배정된 테이블"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {curSlots.flatMap((s) =>
              (venues ?? []).filter((v) => v.region === s.region && v.active).map((v) => {
                const n = cap.get(`${v.id}:${s.id}`) ?? 0;
                const u = tablesUsed(v.id, s.id);
                return (
                  <tr key={`${v.id}:${s.id}`}>
                    <td className={td}>{fmtDate(s.starts_at)} {fmtTime(s.starts_at)} {s.region}</td>
                    <td className={td}>{v.name}</td>
                    <td className={td}>
                      <form action={setCapacity} className="flex items-center gap-2">
                        <input type="hidden" name="venue_id" value={v.id} />
                        <input type="hidden" name="slot_id" value={s.id} />
                        <input name="tables" type="number" min={0} max={20} defaultValue={n} className={`${ctl} w-20`} />
                        <button className="text-[13px] font-semibold text-accent">저장</button>
                      </form>
                    </td>
                    <td className={td}>{u >= n && n > 0 ? <Badge v={[`${u} (가득)`, "candle"]} /> : u}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
        {!curSlots.length && <p className="p-8 text-center text-muted">이 회차에 일정이 없어요.</p>}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Panel title="새 회차 만들기">
          <form action={createRound} className="space-y-3 text-[14px]">
            <input name="title" placeholder="예: 11월 둘째 주 저녁 (필수)" className={`${ctl} w-full`} />
            <label className="flex items-center justify-between gap-2"><span className="text-muted">신청 마감 (필수)</span><input name="deadline" type="datetime-local" className={ctl} /></label>
            <label className="flex items-center justify-between gap-2"><span className="text-muted">자동 매칭 실행 <span className="text-[12px]">비우면 마감과 같은 시각</span></span><input name="match_at" type="datetime-local" className={ctl} /></label>
            <div className="flex items-center justify-between gap-2"><span className="text-muted">모임 날짜 (필수, 1~2개)</span><span className="flex gap-2"><input name="dates" type="date" className={ctl} /><input name="dates" type="date" className={ctl} /></span></div>
            <label className="flex items-center justify-between gap-2"><span className="text-muted">시작 시각 · 진행 시간(분)</span><span className="flex gap-2"><input name="time" type="time" defaultValue="19:30" className={ctl} /><input name="duration" type="number" defaultValue={150} min={60} className={`${ctl} w-24`} /></span></label>
            <div className="flex flex-wrap gap-3"><span className="text-muted">동네 (필수)</span>{REGIONS.map((x) => <label key={x} className="flex items-center gap-1"><input type="checkbox" name="regions" value={x} defaultChecked /> {x}</label>)}</div>
            <label className="flex items-center justify-between gap-2"><span className="text-muted">일정당 최대 테이블 (정원)</span><input name="max_tables" type="number" defaultValue={4} min={1} className={`${ctl} w-24`} /></label>
            <button className={btnPrimary}>만들기</button>
          </form>
        </Panel>
        <Panel title={`제휴 식당 ${venues?.length ?? 0}곳`}>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto text-[14px]">
            {(venues ?? []).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <span><b>{v.name}</b> <span className="text-muted">{v.region}</span></span>
                <span className="truncate text-[13px] text-muted">{v.price_range ?? ""} {v.address}</span>
              </li>
            ))}
          </ul>
          <form action={addVenue} className="mt-4 grid grid-cols-2 gap-2">
            <select name="region" className={ctl}>{REGIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <input name="name" placeholder="식당 이름 (필수)" className={ctl} />
            <input name="address" placeholder="주소 (필수)" className={`${ctl} col-span-2`} />
            <input name="price" placeholder="가격대 (예: 3만 원대)" className={ctl} />
            <button className={btnPrimary}>식당 추가</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
