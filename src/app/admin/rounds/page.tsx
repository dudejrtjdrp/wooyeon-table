import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Plus } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, Term, btnDanger, btnLight, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { Optional, Required } from "@/components/ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { DEFAULT_REGIONS, OPEN_REGIONS } from "@/lib/constants";
import { SIDOS } from "@/lib/regions";
import { dateKey, fmtDateTime, fmtDay, fmtSlot, fmtTime } from "@/lib/format";
import { ROUND_TABS, TABLE_MAX, TABLE_MIN, buildBoard, parseRoundTab, roundsHref, tableRange, type RoundTab } from "@/lib/round-board";
import { MAX_TABLES_LIMIT, canCancelRound, canDeleteSlot, checkRoundEdit, fromKstInput, toKstInput } from "@/lib/round-rules";
import { db } from "@/lib/supabase";
import { copyRoundDraft, copyRoundHref, type RoundDraft } from "@/lib/round-copy";
import { TIP as GLOSSARY_TIP } from "@/lib/admin-glossary";
import { ConfirmButton } from "../confirm-button";
import { addSlot, cancelRound, createRound, deleteSlot, setCapacity, setMaxTables, updateRound } from "./actions";

export const dynamic = "force-dynamic";

const ROUND_STATUS: Record<string, [string, "accent" | "leaf" | "muted" | "candle" | "danger"]> = { open: ["모집 중", "accent"], matching: ["매칭 중", "candle"], matched: ["매칭 완료", "leaf"], closed: ["종료", "muted"], canceled: ["취소", "danger"] };

/** 처음 보면 모를 말 풀이. 머리·표·폼에서 같은 문장을 쓴다 */
const TIP = {
  round: GLOSSARY_TIP.회차,
  slot: GLOSSARY_TIP.일정,
  deadline: "이 시각부터 새 신청과 환불이 막혀요. 비워 두면 모임 주 화요일 밤 12시로 잡혀요.",
  matchAt: "이 시각에 결제를 마친 신청자로 테이블을 짜고 식당을 잡아요. 운영자가 따로 누를 버튼은 없어요.",
  maxTables: `한 일정에 열 수 있는 테이블 수 상한이에요. 한 테이블은 ${TABLE_MIN}~${TABLE_MAX}명이라 4테이블이면 최대 ${4 * TABLE_MAX}명이 앉아요.`,
  stock: "일정마다 식당이 받아 줄 수 있는 테이블 수예요. 자동 매칭은 이 숫자 안에서만 식당을 배정해요.",
  short: `신청이 ${TABLE_MIN}명보다 적어 아직 한 테이블도 만들 수 없는 일정이에요.`,
};

type Draft = RoundDraft;

export default async function Rounds({ searchParams }: { searchParams: Promise<{ r?: string; f?: string; tab?: string; edit?: string; title?: string; deadline?: string; match_at?: string }> }) {
  const me = await requireAdmin();
  const ro = me.level === "viewer";
  const sp = await searchParams;
  const { r, f } = sp;
  const tab: RoundTab = parseRoundTab(sp.tab);
  // 회차 만들기에서 검증에 걸리면 넣었던 값을 그대로 채워 둔다
  let draft: Draft = {};
  try { draft = f ? (JSON.parse(f) as Draft) : {}; } catch { draft = {}; }
  const { rounds: picker, round: cur0 } = await roundsAndCurrent(r);
  // 고치기 탭은 고칠 수 있는 회차(모집 중)를 먼저 연다. 주소로 고른 회차가 있으면 그대로
  const cur = !r && tab === "edit" ? (picker.find((x) => x.status === "open") ?? cur0) : cur0;
  const { data: rounds } = await db().from("rounds").select("id,title,status,apply_deadline,match_at,slots(id,region,starts_at,ends_at,max_tables,application_slots(application_id))").order("match_at");
  // 식당·재고는 '식당 재고' 탭에서만 쓴다
  const stockTab = tab === "stock" && !!cur;
  const { data: venues } = stockTab || tab === "new" ? await db().from("venues").select("id,name,region,active").order("region") : { data: [] };
  // 새 회차 동네 고르기: 배정할 식당이 없는 동네는 표시해 둔다(고르면 식당 부족 예외가 난다)
  const venueRegions = new Set((venues ?? []).filter((v) => v.active).map((v) => v.region));
  const { data: inv } = stockTab ? await db().from("venue_slots").select("venue_id,slot_id,tables_available,slots!inner(round_id)").eq("slots.round_id", cur.id) : { data: [] };
  const { data: used } = stockTab ? await db().from("dining_tables").select("venue_id,slot_id").eq("round_id", cur.id).neq("status", "DISSOLVED") : { data: [] };
  const curSlots = ((rounds ?? []).find((x) => x.id === cur?.id)?.slots ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.region.localeCompare(b.region));
  const cap = new Map((inv ?? []).map((v) => [`${v.venue_id}:${v.slot_id}`, v.tables_available]));
  const tablesUsed = (vid: string, sid: string) => (used ?? []).filter((u) => u.venue_id === vid && u.slot_id === sid).length;

  const selected = (rounds ?? []).find((x) => x.id === cur?.id);
  // 취소한 회차는 DB 상태가 'closed'라 변경 이력(canceled)으로 구분해 '취소'로 보인다
  const { data: canceledEv } = await db().from("status_events").select("entity_id").eq("entity_type", "round").eq("field", "canceled").eq("to_value", "true");
  const canceled = new Set((canceledEv ?? []).map((x) => x.entity_id));
  const statusOf = (x: { id: string; status: string }) => (x.status === "closed" && canceled.has(x.id) ? "canceled" : x.status);

  // 모집 중인 회차 고치기에 쓰는 값
  const t = await now();
  const editable = !ro && selected?.status === "open";
  const { data: liveApps } = selected
    ? await db().from("application_slots").select("slot_id,applications!inner(round_id,application_status)").eq("applications.round_id", selected.id).neq("applications.application_status", "CANCELED")
    : { data: [] };
  const appsBySlot = new Map<string, number>();
  for (const a of liveApps ?? []) appsBySlot.set(a.slot_id, (appsBySlot.get(a.slot_id) ?? 0) + 1);
  const { data: roundApps } = selected
    ? await db().from("applications").select("id,application_status,payment_status").eq("round_id", selected.id).neq("application_status", "CANCELED")
    : { data: [] };
  const submitted = (roundApps ?? []).filter((a) => a.application_status === "SUBMITTED").length;
  const paid = (roundApps ?? []).filter((a) => a.payment_status === "PAID").length;
  const { data: run } = selected ? await db().from("match_runs").select("id").eq("round_id", selected.id).maybeSingle() : { data: null };
  const cancelCheck = selected ? canCancelRound({ status: selected.status, hasMatchRun: !!run, matchAt: selected.match_at, now: t, canceled: canceled.has(selected.id) }) : null;
  // 취소하다 끊겨 아직 정리되지 않은 신청이 남은 회차
  // (취소는 됐는데 환불 전에 끊겨 결제가 그대로인 신청도 포함)
  const { count: unpaidBack } = selected && statusOf(selected) === "canceled"
    ? await db().from("applications").select("id", { count: "exact", head: true }).eq("round_id", selected.id).eq("application_status", "CANCELED").eq("payment_status", "PAID")
    : { count: 0 };
  const leftover = selected && statusOf(selected) === "canceled" ? (roundApps ?? []).length + (unpaidBack ?? 0) : 0;
  // '이렇게 바뀌어요' 미리보기: 고친 값을 주소로 받아 바로 저장하지 않고 먼저 보여 준다 (E3)
  const preview =
    selected && sp.edit === "1"
      ? {
          title: sp.title ?? selected.title,
          deadline: sp.deadline ?? toKstInput(selected.apply_deadline),
          match_at: sp.match_at ?? toKstInput(selected.match_at),
        }
      : null;
  const previewCheck =
    selected && preview
      ? checkRoundEdit({
          status: selected.status,
          before: { title: selected.title, deadline: selected.apply_deadline, matchAt: selected.match_at },
          after: { title: preview.title, deadline: fromKstInput(preview.deadline) ?? "", matchAt: fromKstInput(preview.match_at) ?? "" },
          slotStarts: selected.slots.map((x) => x.starts_at),
          now: t,
        })
      : null;
  const firstSlot = curSlots[0];
  // 일정별 모집 현황 표: 줄=동네, 칸=날짜. 모자람 표시는 모집 중인 회차에서만
  const board = buildBoard(curSlots, appsBySlot, { watch: selected?.status === "open", regionOrder: DEFAULT_REGIONS });
  const range = tableRange(board);
  const lbl = "block text-[15px] font-bold text-ink";
  const help = "mt-1.5 block text-[12px] text-muted";
  const rid = cur?.id;
  // 고치기·식당 재고 탭에서 회차를 바꿔도 같은 탭에 머문다
  // 회차 복제: 저장하지 않고 새 회차 탭을 이 회차 값(다음 주 같은 요일)으로 채워 연다
  const copyHref = (x: { title: string; slots: { region: string; starts_at: string; ends_at: string; max_tables: number }[] }) => copyRoundHref(copyRoundDraft(x, t));
  const pickerIn = (k: RoundTab) => <RoundPicker rounds={picker} current={rid} extra={<input type="hidden" name="tab" value={k} />} />;

  return (
    <div>
      <PageHeader
        title="회차·식당"
        desc="다음 저녁의 일정과 식당을 준비해요."
        actions={!ro && tab !== "new" ? <Link href={roundsHref({ r: rid, tab: "new" })} className={btnPrimary}><Plus size={18} />새 회차 만들기</Link> : undefined}
        how={[
          <><Term tip={TIP.round}>회차</Term> 만들기 (지난 회차 복제도 돼요)</>,
          <>마감까지 모집 현황 보기</>,
          <>마감 뒤 <Term tip={TIP.matchAt}>자동 매칭</Term> 결과 확인</>,
        ]}
      />

      {tab === "new" ? (
        <div className="mt-6 max-w-xl">
          <Link href={roundsHref({ r: rid })} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink"><ArrowLeft size={16} />현황으로</Link>
          <Panel title="새 회차 만들기" className="mt-3 scroll-mt-6">
            <div id="new-round" />
            {ro ? (
              <p className="text-[14px] text-muted">조회 전용 계정이라 회차를 만들거나 식당 재고를 바꿀 수 없어요. 전체 권한 운영자에게 부탁해 주세요.</p>
            ) : (
              <>
                {draft.from && (
                  <p className="mb-4 rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[13px] text-ink" aria-live="polite">
                    &lsquo;{draft.from}&rsquo;의 요일·시각·동네·최대 테이블을 채웠어요. 날짜는 같은 요일 다음 주로 잡았으니 확인하고 고쳐 주세요. 아직 저장한 건 없어요.
                  </p>
                )}
                <p className="mb-5 text-[13px] text-muted">이름·날짜·동네만 채우면 마감과 매칭 시각은 운영 규칙대로 잡혀요. 만들면 날짜×동네마다 <Term tip={TIP.slot}>일정</Term>이 생기고, 그 동네 제휴 식당이 일정마다 2테이블씩 잡혀요.</p>
                {/* 검증 뒤 돌아오면 f가 바뀌므로 폼을 새로 그려 넣었던 값을 다시 채운다(React가 제출 뒤 폼을 비우기 때문) */}
                <form key={f ?? "new"} action={createRound} className="space-y-5 text-[14px]">
                  {draft.from && <input type="hidden" name="from" value={draft.from} />}
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
                              <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] text-ink transition peer-checked:border-accent peer-checked:bg-accent-soft/60 peer-checked:font-semibold peer-checked:text-accent [&>svg]:hidden peer-checked:[&>svg]:block"><Check size={16} strokeWidth={2.8} />{x}{!venueRegions.has(x) && <span className="text-[11px] font-normal text-danger">식당 없음</span>}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    ))}
                    <span className={help}>동네 묶음을 여러 개 고를 수 있어요. 기본은 식당이 있는 서울 네 곳이에요.</span>
                  </div>
                  <label className="block"><span className={lbl}>일정당 최대 테이블 수<Required /></span><input name="max_tables" type="number" required defaultValue={draft.max_tables || 4} min={1} className={`${ctl} mt-2 w-28`} /><span className={help}>한 동네·날짜에 운영할 최대 테이블 수예요. 한 테이블은 {TABLE_MIN}~{TABLE_MAX}명이에요.</span></label>
                  <button className={`${btnPrimary} h-12 w-full text-[15px]`}>회차 만들기</button>
                </form>
              </>
            )}
          </Panel>
        </div>
      ) : (
        <>
          <nav aria-label="회차·식당 화면" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
            {ROUND_TABS.map((x) => (
              <Link
                key={x.key}
                href={roundsHref({ r: rid, tab: x.key })}
                aria-current={tab === x.key ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-[15px] ${tab === x.key ? "border-accent font-bold text-accent" : "border-transparent font-semibold text-muted hover:text-ink"}`}
              >
                {x.label}
              </Link>
            ))}
          </nav>

          {!rounds?.length && (
            <div className="mt-6 rounded-2xl bg-accent-soft/60 px-5 py-4 text-[14px] text-ink">
              <p>아직 회차가 없어요. 이름·날짜·동네만 채우면 마감·매칭 시각은 운영 규칙대로 잡혀요.</p>
              {!ro && <Link href={roundsHref({ tab: "new" })} className={`${btnPrimary} mt-3`}><Plus size={18} />새 회차 만들기</Link>}
            </div>
          )}

          {/* ── 현황: 회차 목록 + 일정별 모집 현황 ── */}
          {tab === "status" && !!rounds?.length && (
            <div className="mt-6 space-y-4">
              <Panel title="회차 목록">
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead><tr>
                      <th className={th}>회차 이름</th>
                      <th className={th}>상태</th>
                      <th className={th}><Term tip={TIP.deadline}>신청 마감</Term></th>
                      <th className={th}><Term tip={TIP.matchAt}>자동 매칭</Term></th>
                      {!ro && <th className={th}><span className="sr-only">복제</span></th>}
                      <th className={th}><span className="sr-only">고르기</span></th>
                    </tr></thead>
                    <tbody>
                      {rounds.map((x) => (
                        <tr key={x.id} className={x.id === rid ? "bg-accent-soft/50" : ""}>
                          <td className={`${td} font-semibold text-ink`}><Link href={roundsHref({ r: x.id })} className="hover:underline">{x.title}</Link></td>
                          <td className={td}><Badge v={ROUND_STATUS[statusOf(x)] ?? [x.status, "muted"]} /></td>
                          <td className={`${td} whitespace-nowrap tabular-nums text-muted`}>{fmtDateTime(x.apply_deadline)}</td>
                          <td className={`${td} whitespace-nowrap tabular-nums text-muted`}>{fmtDateTime(x.match_at)}</td>
                          {!ro && <td className={`${td} text-right`}><Link href={copyHref(x)} title="이 회차 값으로 새 회차 만들기 (저장은 만들기를 눌러야 돼요)" className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-accent hover:underline"><Copy size={14} aria-hidden="true" />이 회차 복제</Link></td>}
                          <td className={`${td} text-right`}><Link href={roundsHref({ r: x.id })} aria-label={`${x.title} 선택`}>{x.id === rid ? <ChevronDown size={18} className="inline text-accent" /> : <ChevronRight size={18} className="inline text-muted" />}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {selected && (
                <Panel title={`${selected.title} · 일정별 모집 현황`}>
                  <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
                    <Link href={`/admin/applicants?r=${selected.id}`} className="text-accent hover:underline">신청자 전체 보기</Link>
                    <Link href={`/admin/matching?r=${selected.id}`} className="text-accent hover:underline">매칭 결과 보기 →</Link>
                  </p>
                  {selected.status === "open" && <p className="text-[13px] text-muted">{fmtDateTime(selected.match_at)}에 결제를 마친 신청자로 자동 매칭해요. 그 전까지는 손댈 일이 없어요.</p>}
                  <p className="mt-1 text-[13px] text-muted">
                    칸마다 그 <Term tip={TIP.slot}>일정</Term>에 신청한 사람 수예요. 누르면 그 동네 신청자 목록이 열려요.
                    {board.clock && <> 모든 일정 {board.clock}에 시작해요.</>}
                    {range && <> 일정마다 <Term tip={TIP.maxTables}>최대 {range.tables}테이블</Term>({range.seats}자리)까지 받아요.</>}
                  </p>
                  {board.shortCount > 0 && (
                    <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">
                      {TABLE_MIN}명이 안 되는 일정이 {board.shortCount}곳 있어요. 마감까지 더 모이지 않으면 그 일정은 테이블을 만들기 어려워요.
                    </p>
                  )}
                  {board.rows.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-[14px]">
                        <thead><tr>
                          <th className={th}>동네</th>
                          {board.cols.map((c) => <th key={c.key} className={`${th} whitespace-nowrap text-center`}>{c.label}</th>)}
                        </tr></thead>
                        <tbody className="divide-y divide-line">
                          {board.rows.map((row) => (
                            <tr key={row.region}>
                              <th scope="row" className={`${td} whitespace-nowrap text-left font-semibold text-ink`}>{row.region}</th>
                              {row.cells.map((c, i) =>
                                c ? (
                                  <td key={c.slotId} className="p-1.5 text-center">
                                    <Link
                                      href={`/admin/applicants?r=${selected.id}&region=${encodeURIComponent(row.region)}`}
                                      aria-label={`${board.cols[i].label} ${row.region} 신청 ${c.count}명${c.short ? ", 모자람" : ""}. 신청자 보기`}
                                      className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-3 py-1.5 tabular-nums transition hover:ring-2 hover:ring-accent/30 ${c.short ? "bg-warn-soft text-warn" : "text-ink hover:bg-field"}`}
                                    >
                                      <span className="text-[16px] font-bold">{c.count}명</span>
                                      {c.short && <span className="text-[11px] font-bold">모자람</span>}
                                    </Link>
                                  </td>
                                ) : (
                                  <td key={board.cols[i].key} className="p-1.5 text-center text-faint" aria-label="일정 없음">–</td>
                                ),
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-8 text-center text-muted">이 회차에 일정이 없어요. 고치기 탭에서 일정을 더할 수 있어요.</p>
                  )}
                  {board.shortCount > 0 && <p className="mt-3 text-[12px] text-muted"><Term tip={TIP.short}>모자람</Term>은 신청이 {TABLE_MIN}명보다 적은 일정이에요. 한 테이블은 {TABLE_MIN}~{TABLE_MAX}명이 앉아요.</p>}
                </Panel>
              )}
            </div>
          )}

          {/* ── 고치기: 이름·마감·매칭 시각, 일정과 정원, 회차 취소 ── */}
          {tab === "edit" && selected && (
            <Panel title={`${selected.title} 고치기`} className="mt-6" action={pickerIn("edit")}>
              {!ro && (
                <p className="-mt-1 mb-4 text-[13px] text-muted">
                  다음 주에도 같은 구성으로 열려면{" "}
                  <Link href={copyHref(selected)} className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-4"><Copy size={14} aria-hidden="true" />이 회차 복제</Link>를 눌러 주세요. 새 회차 칸이 채워진 채로 열리고, &lsquo;회차 만들기&rsquo;를 눌러야 저장돼요.
                </p>
              )}
              {ro ? (
                <p className="text-[14px] text-muted">조회 전용 계정이라 회차를 고치거나 취소할 수 없어요. 전체 권한 운영자에게 부탁해 주세요.</p>
              ) : leftover > 0 ? (
                <div id="cancel" className="scroll-mt-6 rounded-2xl border border-danger/30 p-4 text-[14px]">
                  <p className="font-semibold text-danger">취소한 회차인데 아직 정리되지 않은 신청이 {leftover}건 남아 있어요.</p>
                  <p className="mt-1 text-[13px] text-muted">취소 처리 중에 끊긴 것 같아요. 남은 신청만 같은 방법으로 취소·환불하고 알려요. 이미 처리한 신청은 다시 건드리지 않아요.</p>
                  <form action={cancelRound} className="mt-3">
                    <input type="hidden" name="r" value={selected.id} />
                    <ConfirmButton confirm={`남은 신청 ${leftover}건을 취소하고 결제한 분은 돌려드려요. 계속할까요?`} className={btnDanger}>남은 신청 정리하기</ConfirmButton>
                  </form>
                </div>
              ) : !editable ? (
                <p className="text-[14px] text-muted">{statusOf(selected) === "canceled" ? "취소한 회차예요. 신청자 환불과 알림은 결제·환불, 자동 메시지에서 볼 수 있어요." : "모집 중인 회차만 고칠 수 있어요. 매칭이 시작된 뒤에는 테이블별로 처리해 주세요."}</p>
              ) : (
                <div className="space-y-8 text-[14px]">
                  {/* 1. 이름·신청 마감·자동 매칭 */}
                  <section id="edit" className="scroll-mt-6">
                    <h3 className="text-[16px] font-bold text-ink">이름·마감·매칭 시각</h3>
                    {preview && previewCheck && (
                      <div className="mt-3 rounded-2xl bg-field p-4" aria-live="polite">
                        <p className="text-[15px] font-bold text-ink">이렇게 바뀌어요</p>
                        {previewCheck.changes.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {previewCheck.changes.map((c) => (
                              <li key={c.field} className="flex flex-wrap gap-x-2">
                                <span className="w-20 shrink-0 text-muted">{c.label}</span>
                                <span className="text-muted line-through">{c.fromText}</span>
                                <span aria-hidden className="text-muted">→</span>
                                <span className="sr-only">에서</span>
                                <span className="font-semibold text-ink">{c.toText}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {previewCheck.warnings.map((w) => <p key={w} className="mt-2 rounded-xl bg-candle/10 px-3 py-2 text-[13px] text-ink">{w}</p>)}
                        {previewCheck.errors.map((e) => <p key={e} className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">{e}</p>)}
                        {!previewCheck.errors.length && (
                          <form action={updateRound} className="mt-4 flex flex-wrap items-center gap-2">
                            <input type="hidden" name="r" value={selected.id} />
                            <input type="hidden" name="title" value={preview.title} />
                            <input type="hidden" name="deadline" value={preview.deadline} />
                            <input type="hidden" name="match_at" value={preview.match_at} />
                            <button className={btnPrimary}>이대로 바꾸기</button>
                            <Link href={roundsHref({ r: selected.id, tab: "edit" }, "edit")} className={btnLight}>그만두기</Link>
                          </form>
                        )}
                        {submitted > 0 && !previewCheck.errors.length && previewCheck.changes.some((c) => c.field === "match_at") && <p className="mt-2 text-[12px] text-muted">결제를 마친 신청자에게 바뀐 결과 안내 시각을 알림함으로 알려요.</p>}
                      </div>
                    )}
                    <form key={`${sp.edit}:${sp.title}:${sp.deadline}:${sp.match_at}`} className="mt-3 grid gap-3 sm:grid-cols-3">
                      <input type="hidden" name="r" value={selected.id} />
                      <input type="hidden" name="tab" value="edit" />
                      <input type="hidden" name="edit" value="1" />
                      <label className="block"><span className="text-[13px] font-semibold text-ink">이름</span><input name="title" required maxLength={40} defaultValue={preview?.title ?? selected.title} className={`${ctl} mt-1.5 w-full`} /></label>
                      <label className="block"><span className="text-[13px] font-semibold text-ink"><Term tip={TIP.deadline}>신청 마감</Term></span><input name="deadline" type="datetime-local" required defaultValue={preview?.deadline ?? toKstInput(selected.apply_deadline)} className={`${ctl} mt-1.5 w-full`} /></label>
                      <label className="block"><span className="text-[13px] font-semibold text-ink"><Term tip={TIP.matchAt}>자동 매칭 실행</Term></span><input name="match_at" type="datetime-local" required defaultValue={preview?.match_at ?? toKstInput(selected.match_at)} className={`${ctl} mt-1.5 w-full`} /></label>
                      <p className="text-[12px] text-muted sm:col-span-2">신청 마감은 첫 모임 주 화요일 밤 12시(환불 마감)보다 늦출 수 없어요. 누르면 바로 바뀌지 않고, 바뀌는 점을 먼저 보여 드려요.</p>
                      <button className={`${btnLight} sm:justify-self-end`}>바뀌는 점 보기</button>
                    </form>
                  </section>

                  {/* 2. 일정(날짜×동네)과 일정별 최대 테이블 수 */}
                  <section id="slots" className="scroll-mt-6">
                    <h3 className="text-[16px] font-bold text-ink"><Term tip={TIP.slot}>일정</Term>과 정원</h3>
                    <div className="overflow-x-auto">
                      <table className="mt-3 w-full">
                        <thead><tr>
                          <th className={th}>일정</th>
                          <th className={th}>신청</th>
                          <th className={th}><Term tip={TIP.maxTables}>최대 테이블</Term></th>
                          <th className={th}><span className="sr-only">지우기</span></th>
                        </tr></thead>
                        <tbody className="divide-y divide-line">
                          {curSlots.map((sl) => {
                            const n = appsBySlot.get(sl.id) ?? 0;
                            const del = canDeleteSlot({ status: selected.status, applicants: n, slotCount: curSlots.length });
                            return (
                              <tr key={sl.id}>
                                <td className={td}>{fmtSlot(sl.starts_at)}<span className="block font-semibold text-ink">{sl.region}</span></td>
                                <td className={`${td} tabular-nums`}>{n}명</td>
                                <td className={td}>
                                  <form action={setMaxTables} className="flex items-center gap-2">
                                    <input type="hidden" name="r" value={selected.id} />
                                    <input type="hidden" name="slot_id" value={sl.id} />
                                    <input name="max_tables" type="number" required min={1} max={MAX_TABLES_LIMIT} defaultValue={sl.max_tables} className={`${ctl} w-20`} aria-label={`${fmtSlot(sl.starts_at)} ${sl.region} 최대 테이블 수`} />
                                    <button className={btnLight}>저장</button>
                                  </form>
                                </td>
                                <td className={`${td} text-right`}>
                                  {del.ok ? (
                                    <form action={deleteSlot}>
                                      <input type="hidden" name="r" value={selected.id} />
                                      <input type="hidden" name="slot_id" value={sl.id} />
                                      <ConfirmButton confirm={`${fmtSlot(sl.starts_at)} ${sl.region} 일정을 지우고 잡아 둔 식당 재고도 풀어요. 계속할까요?`} className={`${btnLight} border-danger/40 text-danger hover:bg-danger/5`}>지우기</ConfirmButton>
                                    </form>
                                  ) : (
                                    <span className="block max-w-56 text-left text-[12px] text-muted">{del.reason}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <form action={addSlot} className="mt-4 grid gap-3 rounded-2xl bg-field p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto] sm:items-end">
                      <input type="hidden" name="r" value={selected.id} />
                      <label className="block"><span className="text-[13px] font-semibold text-ink">날짜</span><input name="date" type="date" required min={dateKey(t.toISOString())} className={`${ctl} mt-1.5 w-full`} /></label>
                      <label className="block"><span className="text-[13px] font-semibold text-ink">시작 시각</span><input name="time" type="time" required defaultValue={firstSlot ? toKstInput(firstSlot.starts_at).slice(11, 16) : "19:30"} className={`${ctl} mt-1.5 w-full`} /></label>
                      <label className="block"><span className="text-[13px] font-semibold text-ink">동네</span>
                        <select name="region" required className={`${ctl} mt-1.5 w-full`}>{OPEN_REGIONS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                      </label>
                      <label className="block"><span className="text-[13px] font-semibold text-ink">최대 테이블</span><input name="max_tables" type="number" required min={1} max={MAX_TABLES_LIMIT} defaultValue={firstSlot?.max_tables ?? 4} className={`${ctl} mt-1.5 w-24`} /></label>
                      <button className={btnPrimary}>일정 더하기</button>
                      <p className="text-[12px] text-muted sm:col-span-5">운영 중인 서울 네 동네만 고를 수 있어요. 더하면 그 동네 식당마다 2테이블씩 재고가 잡혀요. 신청자가 있는 일정은 지울 수 없어요.</p>
                    </form>
                  </section>

                  {/* 3. 회차 취소 (되돌릴 수 없음) */}
                  <section id="cancel" className="scroll-mt-6 rounded-2xl border border-danger/30 p-4">
                    <h3 className="text-[16px] font-bold text-danger">회차 취소</h3>
                    <p className="mt-1 text-[13px] text-muted">신청자 {submitted}명에게 취소를 알리고, 결제한 {paid}명은 자동으로 돌려드려요. 1회권은 원래 결제 수단으로 전액, 멤버십·보유 이용권은 쓴 횟수를 되돌려요. 환불이 결제사에서 안 되면 다시 시도하고, 세 번 안 되면 예외 처리함에 올라가요.</p>
                    {cancelCheck && !cancelCheck.ok ? (
                      <p className="mt-3 text-[13px] font-semibold text-ink">{cancelCheck.reason}</p>
                    ) : (
                      <form action={cancelRound} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="r" value={selected.id} />
                        <label className="block min-w-60 flex-1"><span className="text-[13px] font-semibold text-ink">취소 이유<Optional /></span><input name="reason" maxLength={100} placeholder="식당 사정으로 운영이 어려워요" className={`${ctl} mt-1.5 w-full`} /></label>
                        <ConfirmButton confirm={`'${selected.title}' 회차를 취소해요. 신청자 ${submitted}명에게 알리고 결제한 ${paid}명은 자동 환불돼요. 되돌릴 수 없어요. 계속할까요?`} className={btnDanger}>회차 취소하기</ConfirmButton>
                      </form>
                    )}
                  </section>
                </div>
              )}
            </Panel>
          )}

          {/* ── 식당 재고: 일정 × 식당별 받을 수 있는 테이블 ── */}
          {tab === "stock" && !!rounds?.length && (
            <Panel title="식당 재고" className="mt-6" action={pickerIn("stock")}>
              <p className="text-[13px] text-muted">
                <Term tip={TIP.stock}>식당 재고</Term>는 일정마다 식당이 받을 수 있는 테이블 수예요. 일정을 만들면 그 동네 식당마다 2테이블씩 잡히고, 자동 매칭은 이 안에서만 식당을 배정해요.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead><tr>{["일정", "식당", "받을 수 있는 테이블", "배정된 테이블"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {curSlots.flatMap((sl) =>
                      (venues ?? []).filter((v) => v.region === sl.region && v.active).map((v) => {
                        const n = cap.get(`${v.id}:${sl.id}`) ?? 0;
                        const u = tablesUsed(v.id, sl.id);
                        return (
                          <tr key={`${v.id}:${sl.id}`}>
                            <td className={`${td} whitespace-nowrap`}>{fmtDay(sl.starts_at)} {fmtTime(sl.starts_at)}<span className="block font-semibold text-ink">{sl.region}</span></td>
                            <td className={`${td} font-medium text-ink`}>{v.name}</td>
                            <td className={td}>
                              <form action={setCapacity} className="flex items-center gap-2">
                                <input type="hidden" name="venue_id" value={v.id} />
                                <input type="hidden" name="slot_id" value={sl.id} />
                                <input type="hidden" name="r" value={rid ?? ""} />
                                {ro ? <span className="tabular-nums">{n}</span> : <>
                                  <input name="tables" type="number" min={0} max={20} defaultValue={n} className={`${ctl} w-20`} aria-label={`${v.name} 받을 수 있는 테이블`} />
                                  <button className={btnLight}>저장</button>
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
              </div>
              {!curSlots.length && <p className="p-8 text-center text-muted">이 회차에 일정이 없어요.</p>}
              <p className="mt-4 text-[13px] text-muted">제휴 식당 목록과 식당 추가·정보 고치기·배정 끄기는 <Link href="/admin/venues" className="font-semibold text-accent underline underline-offset-4">식당 관리</Link>에서 해요.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
