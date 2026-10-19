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
import { createRound, setCapacity } from "./actions";

export const dynamic = "force-dynamic";

const ROUND_STATUS: Record<string, [string, "accent" | "leaf" | "muted" | "candle"]> = { open: ["모집 중", "accent"], matching: ["매칭 중", "candle"], matched: ["매칭 완료", "leaf"], closed: ["종료", "muted"] };

type Draft = { title?: string; deadline?: string; match_at?: string; dates?: string[]; time?: string; duration?: string; regions?: string[]; max_tables?: string };

export default async function Rounds({ searchParams }: { searchParams: Promise<{ r?: string; f?: string }> }) {
  const me = await requireAdmin();
  const ro = me.level === "viewer";
  const { r, f } = await searchParams;
  // 회차 만들기에서 검증에 걸리면 넣었던 값을 그대로 채워 둔다
  let draft: Draft = {};
  try { draft = f ? (JSON.parse(f) as Draft) : {}; } catch { draft = {}; }
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
      {!rounds?.length && <p className="mt-4 rounded-xl bg-accent-soft/60 px-4 py-3 text-[14px] text-ink">아직 회차가 없어요. 오른쪽 &lsquo;새 회차 만들기&rsquo;에 이름·날짜·동네만 채우면 마감·매칭 시각은 운영 규칙대로 잡혀요.</p>}

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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">{selected.title} · 일정별 모집 현황</p>
                  <span className="flex gap-3 text-[13px] font-semibold">
                    <Link href={`/admin/applicants?r=${selected.id}`} className="text-accent hover:underline">신청자 보기</Link>
                    <Link href={`/admin/matching?r=${selected.id}`} className="text-accent hover:underline">매칭 결과 보기 →</Link>
                  </span>
                </div>
                {selected.status === "open" && <p className="mt-1 text-[12px] text-muted">{fmtDateTime(selected.match_at)}에 결제를 마친 신청자로 자동 매칭해요. 그 전까지는 손댈 일이 없어요.</p>}
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
                            <input type="hidden" name="r" value={cur?.id ?? ""} />
                            {ro ? <span className="tabular-nums">{n}</span> : <>
                              <input name="tables" type="number" min={0} max={20} defaultValue={n} className={`${ctl} w-20`} aria-label={`${v.name} 받을 수 있는 테이블`} />
                              <button className="text-[13px] font-semibold text-accent">저장</button>
                            </>}
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
            <p className="mt-4 text-[13px] text-muted">식당 추가·정보 고치기·배정 끄기는 <Link href="/admin/venues" className="font-semibold text-accent underline underline-offset-4">식당 관리</Link>에서 해요.</p>
          </Panel>
        </div>

        {ro ? (
          <Panel title="새 회차 만들기" className="xl:sticky xl:top-6">
            <p className="text-[14px] text-muted">조회 전용 계정이라 회차를 만들거나 식당 재고를 바꿀 수 없어요. 전체 권한 운영자에게 부탁해 주세요.</p>
          </Panel>
        ) : (
        <Panel title="새 회차 만들기" className="scroll-mt-6 xl:sticky xl:top-6">
          <div id="new-round" />
          {/* 검증 뒤 돌아오면 f가 바뀌므로 폼을 새로 그려 넣었던 값을 다시 채운다(React가 제출 뒤 폼을 비우기 때문) */}
          <form key={f ?? "new"} action={createRound} className="space-y-5 text-[14px]">
            <label className="block"><span className={lbl}>이름<Required /></span><input name="title" required defaultValue={draft.title} placeholder="11월 둘째 주 저녁" className={`${ctl} mt-2 w-full`} /><span className={help}>참가자에게 보이는 회차 이름이에요.</span></label>
            <label className="block"><span className={lbl}>신청 마감<Optional /></span><input name="deadline" type="datetime-local" defaultValue={draft.deadline} className={`${ctl} mt-2 w-full`} /><span className={help}>비우면 모임 주 화요일 밤 12시로 잡혀요. 이 시각부터 환불이 안 되고 매칭이 돌아요.</span></label>
            <label className="block"><span className={lbl}>자동 매칭 실행<Optional /></span><input name="match_at" type="datetime-local" defaultValue={draft.match_at} className={`${ctl} mt-2 w-full`} /><span className={help}>비우면 마감과 같은 시각에 매칭이 진행돼요.</span></label>
            <div><span className={lbl}>날짜<Required /></span><span className="mt-2 grid grid-cols-2 gap-2"><input name="dates" type="date" required defaultValue={draft.dates?.[0]} className={ctl} aria-label="첫째 날 (필수)" /><input name="dates" type="date" defaultValue={draft.dates?.[1]} className={ctl} aria-label="둘째 날 (선택)" /></span><span className={help}>이번 회차에 진행할 저녁 날짜예요. 첫째 날은 꼭 넣고, 둘째 날은 있으면 넣어 주세요.</span></div>
            <div><span className={lbl}>시작 시각 · 진행 시간<Required /></span><span className="mt-2 grid grid-cols-2 gap-2"><input name="time" type="time" required defaultValue={draft.time || "19:30"} className={ctl} aria-label="시작 시각" /><span className="flex items-center gap-2"><input name="duration" type="number" required defaultValue={draft.duration || 150} min={60} className={`${ctl} w-full`} aria-label="진행 시간" /><span className="shrink-0 text-muted">분</span></span></span><span className={help}>모든 식당에 같은 시각에 시작해요.</span></div>
            <div>
              <span className={lbl}>동네<Required /></span>
              {SIDOS.map((s) => (
              <details key={s.name} open={s.name === "서울" || s.areas.some((x) => draft.regions?.includes(x))} className="mt-2">
              <summary className="cursor-pointer py-1 text-[13px] font-semibold text-muted">{s.name}</summary>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {s.areas.map((x) => (
                  <label key={x} className="cursor-pointer">
                    <input type="checkbox" name="regions" value={x} defaultChecked={(draft.regions ?? (DEFAULT_REGIONS as readonly string[])).includes(x)} className="peer sr-only" />
                    <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] text-ink transition peer-checked:border-accent peer-checked:bg-accent-soft/60 peer-checked:font-semibold peer-checked:text-accent [&>svg]:hidden peer-checked:[&>svg]:block"><Check size={16} strokeWidth={2.8} />{x}</span>
                  </label>
                ))}
              </div>
              </details>
              ))}
              <span className={help}>동네 묶음을 여러 개 고를 수 있어요. 기본은 식당이 있는 서울 네 곳이에요.</span>
            </div>
            <label className="block"><span className={lbl}>일정당 최대 테이블 수<Required /></span><input name="max_tables" type="number" required defaultValue={draft.max_tables || 4} min={1} className={`${ctl} mt-2 w-28`} /><span className={help}>한 동네·날짜에 운영할 최대 테이블 수예요.</span></label>
            <button className={`${btnPrimary} h-12 w-full text-[15px]`}>회차 만들기</button>
          </form>
        </Panel>
        )}
      </div>
    </div>
  );
}
