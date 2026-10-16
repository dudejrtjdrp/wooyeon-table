import { CalendarDays, Check, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { Optional, Required } from "@/components/ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_REGIONS } from "@/lib/constants";
import { SIDOS } from "@/lib/regions";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
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

  const selected = (rounds ?? []).find((x) => x.id === cur?.id);
  const lbl = "block text-[15px] font-bold text-ink";
  const help = "mt-1.5 block text-[12px] text-muted";

  return (
    <div>
      <PageHeader title="회차·식당" desc="다음 저녁의 일정과 식당을 준비해요. 회차를 만들면 날짜×동네마다 일정이 생기고, 그 동네 제휴 식당이 일정마다 2테이블씩 잡혀요." />
      {e && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-2 text-[14px] text-danger">{e}</p>}

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Panel title="회차 목록">
            <table className="w-full text-[14px]">
              <thead><tr>{["회차 이름", "상태", "마감 시각", "자동 매칭", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {(rounds ?? []).map((x) => (
                  <tr key={x.id} className={x.id === cur?.id ? "bg-accent-soft/50" : ""}>
                    <td className={`${td} font-semibold text-ink`}><Link href={`/admin/rounds?r=${x.id}`} className="hover:underline">{x.title}</Link></td>
                    <td className={td}><Badge v={ROUND_STATUS[x.status] ?? [x.status, "muted"]} /></td>
                    <td className={`${td} tabular-nums text-muted`}>{fmtDateTime(x.apply_deadline)}</td>
                    <td className={`${td} tabular-nums text-muted`}>{fmtDateTime(x.match_at)}</td>
                    <td className={`${td} text-right`}><Link href={`/admin/rounds?r=${x.id}`} aria-label={`${x.title} 선택`}>{x.id === cur?.id ? <ChevronDown size={18} className="inline text-accent" /> : <ChevronRight size={18} className="inline text-muted" />}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selected && (
              <div className="mt-4 rounded-2xl bg-field p-4">
                <p className="text-[14px] font-semibold text-ink">{selected.title} · 일정별 모집 현황</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {curSlots.map((sl) => {
                    const full = (selected.slots.find((x) => x.id === sl.id)?.application_slots.length ?? 0);
                    return (
                      <div key={sl.id} className="flex items-center gap-3 rounded-xl bg-card p-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CalendarDays size={20} /></span>
                        <span>
                          <span className="block text-[12px] text-muted">{fmtDay(sl.starts_at)} {fmtTime(sl.starts_at)}</span>
                          <span className="block text-[16px] font-bold text-ink">{sl.region}</span>
                          <span className="block text-[12px] text-muted">{full}명 신청 · 최대 {sl.max_tables}테이블</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="식당 재고" action={<RoundPicker rounds={picker} current={cur?.id} />}>
            <table className="w-full text-[14px]">
              <thead><tr>{["일정", "식당", "받을 수 있는 테이블", "배정된 테이블"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {curSlots.flatMap((sl) =>
                  (venues ?? []).filter((v) => v.region === sl.region && v.active).map((v) => {
                    const n = cap.get(`${v.id}:${sl.id}`) ?? 0;
                    const u = tablesUsed(v.id, sl.id);
                    return (
                      <tr key={`${v.id}:${sl.id}`}>
                        <td className={td}>{fmtDay(sl.starts_at)} {fmtTime(sl.starts_at)} {sl.region}</td>
                        <td className={`${td} font-medium text-ink`}>{v.name}</td>
                        <td className={td}>
                          <form action={setCapacity} className="flex items-center gap-2">
                            <input type="hidden" name="venue_id" value={v.id} />
                            <input type="hidden" name="slot_id" value={sl.id} />
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
          </Panel>

          <Panel title={`제휴 식당 ${venues?.length ?? 0}곳`}>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[14px]">
                <thead><tr>{["지역", "식당", "주소", "가격대"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {(venues ?? []).map((v) => (
                    <tr key={v.id}>
                      <td className={`${td} text-muted`}>{v.region}</td>
                      <td className={`${td} font-semibold text-ink`}>{v.name}</td>
                      <td className={`${td} text-[#4c5368]`}>{v.address}</td>
                      <td className={`${td} text-muted`}>{v.price_range ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 text-[15px] font-bold text-ink">식당 추가</p>
            <form action={addVenue} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[110px_1fr_1.4fr_120px_auto]">
              <select name="region" className={ctl} aria-label="동네 묶음">{SIDOS.map((s) => <optgroup key={s.name} label={s.name}>{s.areas.map((x) => <option key={x}>{x}</option>)}</optgroup>)}</select>
              <input name="name" placeholder="식당 이름 (필수)" className={ctl} />
              <input name="address" placeholder="주소 (필수)" className={ctl} />
              <input name="price" placeholder="가격대 (선택)" className={ctl} />
              <input name="rating" type="number" step="0.1" min="0" max="5" placeholder="리뷰 평점 (예: 4.5)" className={ctl} />
              <select name="channel" className={ctl} aria-label="예약 채널" defaultValue="naver"><option value="naver">네이버 예약</option><option value="catchtable">캐치테이블</option><option value="phone">전화 예약</option></select>
              <input name="booking_url" placeholder="예약 페이지 주소 (선택)" className={ctl} />
              <button className={btnPrimary}>식당 추가</button>
            </form>
          </Panel>
        </div>

        <Panel title="새 회차 만들기" className="xl:sticky xl:top-6">
          <form action={createRound} className="space-y-5 text-[14px]">
            <label className="block"><span className={lbl}>이름<Required /></span><input name="title" placeholder="11월 둘째 주 저녁" className={`${ctl} mt-2 w-full`} /><span className={help}>참가자에게 보이는 회차 이름이에요.</span></label>
            <label className="block"><span className={lbl}>신청 마감<Optional /></span><input name="deadline" type="datetime-local" className={`${ctl} mt-2 w-full`} /><span className={help}>비우면 모임 주 화요일 밤 12시로 잡혀요. 이 시각부터 환불이 안 되고 매칭이 돌아요.</span></label>
            <label className="block"><span className={lbl}>자동 매칭 실행<Optional /></span><input name="match_at" type="datetime-local" className={`${ctl} mt-2 w-full`} /><span className={help}>비우면 마감과 같은 시각에 매칭이 진행돼요.</span></label>
            <div><span className={lbl}>날짜<Required /></span><span className="mt-2 grid grid-cols-2 gap-2"><input name="dates" type="date" className={ctl} aria-label="첫째 날" /><input name="dates" type="date" className={ctl} aria-label="둘째 날" /></span><span className={help}>이번 회차에 진행할 저녁 날짜를 1~2개 골라 주세요.</span></div>
            <div><span className={lbl}>시작 시각 · 진행 시간<Required /></span><span className="mt-2 grid grid-cols-2 gap-2"><input name="time" type="time" defaultValue="19:30" className={ctl} aria-label="시작 시각" /><span className="flex items-center gap-2"><input name="duration" type="number" defaultValue={150} min={60} className={`${ctl} w-full`} aria-label="진행 시간" /><span className="shrink-0 text-muted">분</span></span></span><span className={help}>모든 식당에 같은 시각에 시작해요.</span></div>
            <div>
              <span className={lbl}>동네<Required /></span>
              {SIDOS.map((s) => (
              <details key={s.name} open={s.name === "서울"} className="mt-2">
              <summary className="cursor-pointer py-1 text-[13px] font-semibold text-muted">{s.name}</summary>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {s.areas.map((x) => (
                  <label key={x} className="cursor-pointer">
                    <input type="checkbox" name="regions" value={x} defaultChecked={(DEFAULT_REGIONS as readonly string[]).includes(x)} className="peer sr-only" />
                    <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] text-ink transition peer-checked:border-accent peer-checked:bg-accent-soft/60 peer-checked:font-semibold peer-checked:text-accent [&>svg]:hidden peer-checked:[&>svg]:block"><Check size={16} strokeWidth={2.8} />{x}</span>
                  </label>
                ))}
              </div>
              </details>
              ))}
              <span className={help}>동네 묶음을 여러 개 고를 수 있어요. 기본은 식당이 있는 서울 네 곳이에요.</span>
            </div>
            <label className="block"><span className={lbl}>일정당 최대 테이블 수<Required /></span><input name="max_tables" type="number" defaultValue={4} min={1} className={`${ctl} mt-2 w-28`} /><span className={help}>한 동네·날짜에 운영할 최대 테이블 수예요.</span></label>
            <button className={`${btnPrimary} h-12 w-full text-[15px]`}>회차 만들기</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
