import { BellRing, CalendarDays, ChartColumn, ChartPie, Check, ChevronDown, ChevronRight, CreditCard, FileText, FlaskConical, Megaphone, RotateCcw, Send, Shuffle, Store, TriangleAlert, UserRound, UserX, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { btnLight, ctl } from "@/components/admin-ui";
import { IMG } from "@/components/ui";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { tick } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { autoAttend, moveClock, reapply, resetRound, runTick, seedParticipants } from "./demo-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = {
  payment: "결제 오류",
  refund: "자동 환불 실패",
  data_missing: "데이터 누락",
  condition_conflict: "조건 충돌",
  venue_shortage: "식당 부족",
  notification: "알림 발송 실패",
  no_show: "노쇼 후보",
  safety: "안전 신고",
};

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ r?: string; m?: string }> }) {
  await requireAdmin();
  // 밀린 일(마감·리마인드·종료)은 화면을 먼저 보낸 뒤 처리한다
  after(() => tick().catch(() => null));
  const { r, m } = await searchParams;
  const t = await now();
  const { data: clock } = await db().from("app_clock").select("offset_seconds").eq("id", 1).single();

  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at,apply_deadline").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.find((x) => x.status !== "closed") ?? rounds?.[0];
  const nextRound = rounds?.find((x) => round && x.match_at > round.match_at);

  const { data: apps } = round
    ? await db().from("applications").select("id,payment_status,match_status,attendance_status,realloc_count,resolution").eq("round_id", round.id)
    : { data: [] };
  const list = apps ?? [];
  const paid = list.filter((a) => !["PENDING", "FAILED"].includes(a.payment_status));
  const confirmed = list.filter((a) => a.match_status === "CONFIRMED");
  const reallocated = confirmed.filter((a) => a.realloc_count > 0);
  const waitingChoice = list.filter((a) => a.match_status === "ALTERNATIVE_OFFERED");
  const attended = list.filter((a) => a.attendance_status === "ATTENDED");
  const ranMatching = round && round.status !== "open";
  const matchRate = paid.length && ranMatching ? Math.round((confirmed.length / paid.length) * 100) : null;

  const { data: run } = round ? await db().from("match_runs").select("summary,status,finished_at").eq("round_id", round.id).maybeSingle() : { data: null };
  const { count: tableCount } = round ? await db().from("dining_tables").select("id", { count: "exact", head: true }).eq("round_id", round.id) : { count: 0 };

  const { data: ex } = await db().from("exceptions").select("kind").eq("status", "open");
  const exCount = new Map<string, number>();
  for (const e of ex ?? []) exCount.set(e.kind, (exCount.get(e.kind) ?? 0) + 1);

  // 회차 단계: 모집 중 → 마감·자동 매칭 → 안내 발송 → 모임 → 후기
  const { data: sl } = round ? await db().from("slots").select("starts_at,ends_at").eq("round_id", round.id).order("starts_at") : { data: [] };
  const firstStart = sl?.[0]?.starts_at;
  const lastEnd = sl?.length ? sl[sl.length - 1].ends_at : null;
  const left = (iso: string) => {
    const ms = new Date(iso).getTime() - t.getTime();
    const d = Math.floor(ms / 86400_000);
    const h = Math.floor((ms % 86400_000) / 3600_000);
    return d > 0 ? `${d}일 ${h}시간` : `${Math.max(h, 0)}시간`;
  };
  let stage = 0;
  let stageNote = round ? `마감까지 ${left(round.match_at)}` : "";
  if (round && (new Date(round.match_at) <= t || run?.status === "done")) {
    stage = 2;
    stageNote = firstStart && new Date(firstStart) > t ? `다음 모임까지 ${left(firstStart)}` : "";
    if (firstStart && new Date(firstStart) <= t) { stage = 3; stageNote = "모임 진행 중"; }
    if (lastEnd && new Date(lastEnd) <= t) { stage = 4; stageNote = "후기를 모으고 있어요"; }
  }
  const STAGES = [
    { l: "모집 중", I: Megaphone },
    { l: "마감 · 자동 매칭", I: Shuffle },
    { l: "안내 발송", I: Send },
    { l: "모임", I: CalendarDays },
    { l: "후기", I: FileText },
  ];
  const TILES: [string, string, LucideIcon][] = [
    ["safety", "안전 신고", TriangleAlert], ["payment", "결제 오류", CreditCard], ["refund", "환불 실패", RotateCcw], ["data_missing", "데이터 누락", FileText],
    ["condition_conflict", "조건 충돌", Shuffle], ["venue_shortage", "식당 부족", Store], ["notification", "알림 실패", BellRing], ["no_show", "노쇼 후보", UserX],
  ];
  const lateCancel = list.filter((a) => a.attendance_status === "CANCELED_LATE").length;
  const attendRate = confirmed.length && attended.length ? Math.round((attended.length / confirmed.length) * 100) : null;
  const { data: logs } = await db().from("status_events").select("id,created_at,field,to_value,reason").eq("actor", "system").order("created_at", { ascending: false }).limit(6);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -right-9 -top-8 hidden h-[190px] w-[440px] lg:block" style={{ maskImage: "radial-gradient(90% 100% at 80% 20%, #000 45%, transparent 85%)", WebkitMaskImage: "radial-gradient(90% 100% at 80% 20%, #000 45%, transparent 85%)" }}>
        <Image src={IMG.roundTable} alt="" fill sizes="440px" className="object-cover" style={{ objectPosition: "center 60%" }} />
      </div>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">오늘 처리할 일</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            자동 처리를 확인하고 필요한 일만 살펴봐요. 지금 {fmtDateTime(t.toISOString())}
            {Number(clock?.offset_seconds) ? <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">시연용 가상 시각</span> : null}
          </p>
        </div>
        <form className="flex items-center gap-2 lg:mr-[400px]">
          <select name="r" defaultValue={round?.id} className={ctl}>
            {rounds?.map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
          <button className={btnLight}>보기</button>
        </form>
      </div>

      {m && <p className="relative mt-4 rounded-xl bg-leaf/10 px-4 py-3 text-[14px] font-medium text-leaf">{m}</p>}

      {round && (
        <section className="shadow-card relative mt-6 rounded-[20px] bg-card px-6 py-5">
          <ol className="flex items-start">
            {STAGES.map(({ l, I }, i) => {
              const done = i < stage;
              const cur = i === stage;
              return (
                <li key={l} className="relative flex flex-1 flex-col items-center text-center">
                  {i > 0 && <span className={`absolute right-1/2 top-5 h-0.5 w-full -translate-y-1/2 ${i <= stage ? "bg-accent/50" : "bg-line"}`} style={{ marginRight: 24, width: "calc(100% - 48px)" }} />}
                  <span className={`relative z-10 flex size-10 items-center justify-center rounded-full ${cur ? "bg-accent text-white shadow-cta" : done ? "bg-accent-soft text-accent" : "bg-field text-muted"}`}>
                    {done ? <Check size={19} strokeWidth={2.6} /> : <I size={18} />}
                  </span>
                  <span className={`mt-2 text-[14px] ${cur ? "font-bold text-accent" : "text-ink/80"}`}>{l}</span>
                  {cur && stageNote && <span className="text-[12px] text-accent">{stageNote}</span>}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">{round.title} · 매칭 {fmtDateTime(round.match_at)}{run?.finished_at ? ` · 매칭 실행 ${fmtDateTime(run.finished_at)}` : ""}</p>
        </section>
      )}

      <h2 className="mt-8 text-[20px] font-bold tracking-[-0.02em] text-ink">지금 처리할 일</h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {TILES.map(([k, l, I]) => {
          const n = exCount.get(k) ?? 0;
          return (
            <Link key={k} href={`/admin/exceptions?k=${k}`} className={`shadow-card group rounded-[18px] p-4 transition hover:-translate-y-0.5 ${n ? "bg-card ring-1 ring-danger/40" : "bg-card"}`}>
              <p className={`flex items-center gap-2 text-[14px] font-semibold ${n ? "text-ink" : "text-muted"}`}><I size={18} className={n ? "text-danger" : "text-muted"} />{l}</p>
              <p className="mt-2 flex items-end justify-between">
                <span className={`text-[28px] font-bold tabular-nums ${n ? "text-danger" : "text-muted/70"}`}>{n}</span>
                <ChevronRight size={18} className="mb-1.5 text-muted" />
              </p>
            </Link>
          );
        })}
      </div>
      {!ex?.length && <p className="mt-3 text-[13px] text-muted">지금은 운영자가 볼 일이 없어요. 모두 자동으로 처리됐어요.</p>}

      {round && (
        <>
          <h2 className="mt-8 text-[20px] font-bold tracking-[-0.02em] text-ink">주요 현황</h2>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi I={Users} label="신청" value={`${list.length}명`} sub={`결제 완료 ${paid.length}명`} />
            <Kpi I={ChartColumn} label="자동 매칭 성공률" value={matchRate === null ? "-" : `${matchRate}%`} sub={`확정 ${confirmed.length}명 · 테이블 ${tableCount ?? 0}개 · 재배치 ${reallocated.length}명`} />
            <Kpi I={UserRound} label="대안 선택 대기" value={`${waitingChoice.length}명`} sub="다른 일정·보관·환불 선택 전" danger={waitingChoice.length > 0} />
            <Kpi I={ChartPie} label="참석률" value={attendRate === null ? "-" : `${attendRate}%`} sub={`참석 ${attended.length} · 늦은 취소 ${lateCancel} · 노쇼 후보 ${exCount.get("no_show") ?? 0}`} />
          </div>
        </>
      )}

      <h2 className="mt-8 text-[20px] font-bold tracking-[-0.02em] text-ink">최근 자동 처리 기록</h2>
      <ul className="shadow-card mt-3 divide-y divide-line rounded-[20px] bg-card px-5">
        {(logs ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-4 py-3 text-[14px]">
            <FileText size={18} className="shrink-0 text-accent" />
            <span className="w-40 shrink-0 tabular-nums text-muted">{fmtDateTime(l.created_at)}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.reason ?? `${l.field} → ${l.to_value}`}</span>
          </li>
        ))}
        {!logs?.length && <li className="py-4 text-[14px] text-muted">아직 자동 처리 기록이 없어요.</li>}
      </ul>

      {round && (
        <details className="group mt-8 rounded-[20px] border-2 border-dashed border-accent/30 bg-card/60 p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="flex items-center gap-2 text-[17px] font-semibold text-ink"><FlaskConical size={20} className="text-accent" />심사용 시연 패널 <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent group-open:hidden">접힘</span></span>
            <ChevronDown size={20} className="text-muted transition group-open:rotate-180" />
          </summary>
          <p className="mt-1 text-[13px] text-muted">마감 시각을 기다리지 않고 한 회차의 흐름을 처음부터 끝까지 돌려볼 수 있어요. 실제 운영에서는 숨기는 화면이에요.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <form action={seedParticipants} className="shadow-card rounded-[20px] bg-card p-4">
              <input type="hidden" name="round_id" value={round.id} />
              <p className="text-[14px] font-semibold">① 테스트 참가자 만들기</p>
              <p className="mt-1 text-[12px] text-muted">결제까지 끝난 상태로 신청시켜요. 일부는 일부러 홍대에 몰거나 나이 차를 크게 넣어 재배치·실패 상황이 생겨요.</p>
              <div className="mt-3 flex gap-2">
                <input name="count" type="number" defaultValue={36} min={4} max={60} className="h-10 w-20 rounded-xl border border-line px-3 text-[14px]" />
                <button className="h-10 flex-1 rounded-xl bg-accent text-[14px] font-semibold text-white">만들기</button>
              </div>
            </form>

            <div className="shadow-card rounded-[20px] bg-card p-4">
              <p className="text-[14px] font-semibold">② 시각 옮기기</p>
              <p className="mt-1 text-[12px] text-muted">옮기면 그 시각에 해야 할 일(매칭, 리마인드, 대화 주제 게시, 모임 종료)을 바로 처리해요.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["deadline", "매칭 마감 직후"],
                  ["dayBefore", "모임 하루 전"],
                  ["start", "모임 시작"],
                  ["end", "모임 끝난 뒤"],
                ].map(([to, label]) => (
                  <form key={to} action={moveClock}>
                    <input type="hidden" name="round_id" value={round.id} />
                    <input type="hidden" name="to" value={to} />
                    <button className="h-10 w-full rounded-xl border border-line bg-card text-[13px] font-medium hover:border-accent">{label}</button>
                  </form>
                ))}
              </div>
              <form action={moveClock} className="mt-2">
                <input type="hidden" name="to" value="reset" />
                <button className="w-full text-[12px] text-muted underline underline-offset-4">실제 시각으로 돌아가기</button>
              </form>
            </div>

            <form action={autoAttend} className="shadow-card rounded-[20px] bg-card p-4">
              <input type="hidden" name="round_id" value={round.id} />
              <p className="text-[14px] font-semibold">③ 테스트 참가자 체크인·후기 채우기 (모임 시작 뒤)</p>
              <p className="mt-1 text-[12px] text-muted">일부는 서로 &lsquo;다시는 싫어요&rsquo;를 골라요. 다음 매칭에서 같은 테이블에 앉지 않는지 볼 수 있어요.</p>
              <button className="mt-3 h-10 w-full rounded-xl bg-accent text-[14px] font-semibold text-white">채우기</button>
            </form>

            {nextRound && (
              <form action={reapply} className="shadow-card rounded-[20px] bg-card p-4">
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="next_round_id" value={nextRound.id} />
                <p className="text-[14px] font-semibold">④ 다음 차수에 다시 신청시키기</p>
                <p className="mt-1 text-[12px] text-muted">{nextRound.title}에 참석자들을 다시 넣어요. 그 차수를 매칭하면 이전 만남과 비선호가 반영돼요.</p>
                <button className="mt-3 h-10 w-full rounded-xl bg-accent text-[14px] font-semibold text-white">다시 신청시키기</button>
              </form>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
            <form action={runTick}><button className="underline underline-offset-4">밀린 작업 지금 처리</button></form>
            <form action={resetRound}>
              <input type="hidden" name="round_id" value={round.id} />
              <button className="text-accent underline underline-offset-4">이 회차 시연 데이터 초기화</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

function Kpi({ I, label, value, sub, danger }: { I: LucideIcon; label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="shadow-card flex gap-4 rounded-[20px] bg-card p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><I size={22} /></span>
      <div className="min-w-0">
        <p className="text-[14px] text-muted">{label}</p>
        <p className={`mt-0.5 text-[30px] font-bold tabular-nums tracking-[-0.03em] ${danger ? "text-danger" : "text-ink"}`}>{value}</p>
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}
