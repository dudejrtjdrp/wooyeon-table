import { BellRing, CalendarDays, ChartColumn, ChartPie, Check, ChevronDown, ChevronRight, CreditCard, FileText, FlaskConical, Megaphone, RotateCcw, Send, Shuffle, Store, TriangleAlert, UserRound, UserX, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HowTo, Term, btnLight, btnPrimary, ctl } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { IMG } from "@/components/ui";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { eventText } from "@/lib/labels";
import { computeMetrics, metricValue } from "@/lib/metrics";
import { maybeTick } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "./confirm-button";
import { autoAttend, moveClock, reapply, resetRound, runTick, seedParticipants, toggleBots } from "./demo-actions";
import { botsOn } from "@/lib/sim/bots";
import { loadMetricsInput } from "./metrics/load";
import { roundLabel } from "@/lib/round-label";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await requireAdmin();
  // 밀린 일(마감·리마인드·종료)은 화면을 먼저 보낸 뒤 처리한다
  after(() => maybeTick().catch(() => null));
  const { r } = await searchParams;
  const t = await now();
  const { data: clock } = await db().from("app_clock").select("offset_seconds").eq("id", 1).single();

  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at,apply_deadline,slots(starts_at)").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.find((x) => x.status !== "closed") ?? rounds?.[0];
  const nextRound = rounds?.find((x) => round && x.match_at > round.match_at);

  const { data: apps } = round
    ? await db().from("applications").select("id,payment_status,match_status,attendance_status,realloc_count,resolution").eq("round_id", round.id)
    : { data: [] };
  const list = apps ?? [];
  const paid = list.filter((a) => !["PENDING", "FAILED"].includes(a.payment_status));
  const confirmed = list.filter((a) => a.match_status === "CONFIRMED");
  const waitingChoice = list.filter((a) => a.match_status === "ALTERNATIVE_OFFERED" && a.resolution !== "wait");
  const attended = list.filter((a) => a.attendance_status === "ATTENDED");
  const ranMatching = round && round.status !== "open";
  const matchRate = paid.length && ranMatching ? Math.round((confirmed.length / paid.length) * 100) : null;

  const { data: run } = round ? await db().from("match_runs").select("summary,status,finished_at").eq("round_id", round.id).maybeSingle() : { data: null };
  // 해제된 테이블은 빼고 센다(매칭 모니터의 '지금 테이블'과 같은 기준)
  const { count: tableCount } = round ? await db().from("dining_tables").select("id", { count: "exact", head: true }).eq("round_id", round.id).neq("status", "DISSOLVED") : { count: 0 };

  // 자동 처리 상태: 마지막 실행 시각과 다시 보내는 중인 알림 (INF-08)
  const { data: ran } = await db().from("settings").select("value").eq("key", "tick.ran").maybeSingle();
  const bots = await botsOn();
  const { count: retrying } = await db().from("notifications").select("id", { count: "exact", head: true }).eq("status", "sent").like("last_error", "푸시 실패%").lt("attempts", 3).gte("sent_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  // 처리할 예외는 회차와 상관없이 지금 열린 것 전부(예외 처리함과 같은 기준). 아래 '주요 현황'만 고른 회차 기준이다
  const { data: ex } = await db().from("exceptions").select("kind,ref_type,ref_id").eq("status", "open");
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
    ["condition_conflict", "조건 충돌", Shuffle], ["venue_shortage", "식당 부족", Store], ["notification", "알림 실패", BellRing], ["no_show", "노쇼 후보", UserX], ["reservation", "식당 예약 확인", Store],
  ];
  const lateCancel = list.filter((a) => a.attendance_status === "CANCELED_LATE").length;
  const appIds = new Set(list.map((a) => a.id));
  const roundNoShow = (ex ?? []).filter((e) => e.kind === "no_show" && e.ref_type === "application" && appIds.has(e.ref_id)).length;
  const attendRate = confirmed.length && attended.length ? Math.round((attended.length / confirmed.length) * 100) : null;
  const { data: logs } = await db().from("status_events").select("id,created_at,entity_type,field,from_value,to_value,reason").eq("actor", "system").order("created_at", { ascending: false }).limit(6);
  const openTotal = ex?.length ?? 0;
  // 운영 지표: 이 회차의 재배치 성공률과 핵심 3개(자동 확정률·개입률·처리 시간)
  const metrics = round ? computeMetrics(await loadMetricsInput(), round.id) : [];
  const mt = (k: string) => metrics.find((x) => x.key === k);
  const realloc = mt("realloc_success");
  const rq = round ? `?r=${round.id}` : "";

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
          <p className="mt-1 text-[13px] text-muted">
            자동 처리는 10분마다 돌아요{ran?.value?.at ? ` · 마지막 ${fmtDateTime(ran.value.at)}` : ""}
            {retrying ? <span className="ml-2 font-semibold text-warn">알림 {retrying}건 다시 보내는 중</span> : null}
          </p>
        </div>
        <form className="flex min-w-0 max-w-full items-center gap-2 lg:mr-[400px]" aria-label="회차 고르기">
          <select name="r" defaultValue={round?.id} className={`${ctl} min-w-0 max-w-full`}>
            {rounds?.map((x) => (
              <option key={x.id} value={x.id}>{roundLabel(x.title, x.slots.map((s) => s.starts_at))}</option>
            ))}
          </select>
          <button className={btnLight}>보기</button>
        </form>
      </div>
      <div className="relative lg:mr-[400px]">
        <HowTo steps={["처리할 일 숫자를 눌러 예외 처리함으로 가기", "건마다 적힌 '먼저 할 일'대로 버튼 누르기", <>위에서 <Term tip={TIP.회차}>회차</Term>를 골라 진행 단계·현황 보기</>]} />
      </div>

      {!round && (
        <section className="shadow-card relative mt-6 rounded-[20px] bg-card p-8 text-center">
          <p className="text-[18px] font-bold text-ink">아직 회차가 없어요</p>
          <p className="mt-1.5 text-[14px] text-muted">첫 회차를 만들면 신청을 받고, 마감 시각에 매칭이 자동으로 돌아요. 이 화면에서 결과와 처리할 일을 보면 돼요.</p>
          {me.level === "full" ? <Link href="/admin/rounds?tab=new" className={`${btnPrimary} mt-5`}>회차 만들기</Link> : <p className="mt-4 text-[13px] text-muted">조회 전용 계정이라 회차는 전체 권한 운영자가 만들어요.</p>}
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">
          지금 처리할 일 <span className={`tabular-nums ${openTotal ? "text-danger" : "text-muted"}`}>{openTotal}건</span>
          <span className="ml-2 text-[14px] font-medium text-muted">모든 회차 합계</span>
        </h2>
        {openTotal > 0 && <Link href="/admin/exceptions" className="text-[14px] font-semibold text-accent hover:underline">예외 처리함에서 오래된 것부터 보기 →</Link>}
      </div>
      {!openTotal ? (
        // 0건이면 칸 9개를 크게 늘어놓지 않고 한 줄로 말한다. 유형별 숫자(모두 0)와 목록 링크는 작은 칩으로 늘 보인다(A2)
        <>
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-leaf/10 px-4 py-3 text-[14px] font-semibold text-leaf"><Check size={18} strokeWidth={2.6} />지금 처리할 일 없어요. 자동으로 풀리지 않은 일이 생기면 여기에 숫자로 올라와요.</p>
          <ZeroTiles tiles={TILES} />
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {TILES.filter(([k]) => exCount.get(k)).map(([k, l, I]) => (
              <Link key={k} href={`/admin/exceptions?k=${k}`} title={TILE_TIP[k]} className="shadow-card group rounded-[18px] bg-card p-5 ring-1 ring-danger/40 transition hover:-translate-y-0.5">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink"><I size={19} className="text-danger" />{l}</p>
                <p className="mt-2 flex items-end justify-between">
                  <span className="text-[34px] font-bold tabular-nums text-danger">{exCount.get(k)}<span className="ml-0.5 text-[16px]">건</span></span>
                  <span className="mb-1.5 flex items-center text-[13px] font-semibold text-accent">처리하러 가기<ChevronRight size={17} /></span>
                </p>
              </Link>
            ))}
          </div>
          {TILES.some(([k]) => !exCount.get(k)) && <ZeroTiles tiles={TILES.filter(([k]) => !exCount.get(k))} label="0건" />}
        </>
      )}

      {round && (
        <section className="shadow-card relative mt-8 rounded-[20px] bg-card px-6 py-5">
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
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">{roundLabel(round.title, round.slots.map((s) => s.starts_at))} · 매칭 {fmtDateTime(round.match_at)}{run?.finished_at ? ` · 매칭 실행 ${fmtDateTime(run.finished_at)}` : ""}</p>
        </section>
      )}

      {round && (
        <>
          <h2 className="mt-8 text-[20px] font-bold tracking-[-0.02em] text-ink">주요 현황 <span className="text-[14px] font-medium text-muted">{round.title} 기준</span></h2>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi href={`/admin/applicants${rq}`} I={Users} label="신청" value={`${list.length}명`} sub={`결제 완료 ${paid.length}명`} />
            <Kpi href={`/admin/matching${rq}`} I={ChartColumn} label="자동 매칭 성공률" value={matchRate === null ? "매칭 전" : `${matchRate}%`} sub={`확정 ${confirmed.length}명 · 테이블 ${tableCount ?? 0}개`} />
            <Kpi href={`/admin/matching${rq}`} I={Shuffle} label={<>자동 <Term inLink tip={TIP.재배치}>재배치</Term> 성공률</>} value={realloc ? metricValue(realloc) ?? "대상 없음" : "-"} sub={realloc ? `대상 ${realloc.denominator}명 중 ${realloc.numerator}명이 재배치로 확정` : undefined} />
            <Kpi href={`/admin/applicants${rq}${rq ? "&" : "?"}s=CHOOSING`} I={UserRound} label={<><Term inLink tip={TIP.대체일정}>대체 일정</Term>·환불 선택 대기</>} value={`${waitingChoice.length}명`} sub="다른 일정·보관·환불을 아직 안 고름 (자리 기다리기를 고른 사람 제외)" danger={waitingChoice.length > 0} />
            <Kpi href={`/admin/attendance${rq}`} I={ChartPie} label="참석률" value={attendRate === null ? "모임 전" : `${attendRate}%`} sub={<>참석 {attended.length} · 늦은 취소 {lateCancel} · <Term inLink tip={TIP.노쇼후보}>노쇼 후보</Term> {roundNoShow}</>} />
          </div>

          <div className="mt-8 flex items-end justify-between gap-3">
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">운영 지표 <span className="text-[14px] font-medium text-muted">{round.title} 기준</span></h2>
            <Link href={`/admin/metrics${rq}`} className="text-[14px] font-semibold text-accent hover:underline">지표 13개 전체와 정의 보기 →</Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {(["auto_confirm", "intervention", "ops_time"] as const).map((k) => {
              const x = mt(k);
              if (!x) return null;
              const v = metricValue(x);
              return (
                <Link key={k} href={`/admin/metrics${rq}`} className="shadow-card rounded-[20px] bg-card p-5 transition hover:-translate-y-0.5">
                  <p className="text-[14px] text-muted"><Term inLink tip={METRIC_TIP[k]}>{x.name}</Term> <span className="text-[12px]">· {x.higherIsBetter ? "높을수록 좋음" : "낮을수록 좋음"}</span></p>
                  <p className={`mt-0.5 font-bold tabular-nums tracking-[-0.03em] ${v ? "text-[30px] text-ink" : "py-2 text-[17px] text-muted"}`}>{v ?? "아직 데이터 없음"}</p>
                  <p className="text-[13px] text-muted">{x.numeratorLabel} {x.numerator} ÷ {x.denominatorLabel} {x.denominator}</p>
                  {x.sub && <p className="text-[13px] font-semibold text-ink/80">{x.sub}</p>}
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className="mt-8 text-[20px] font-bold tracking-[-0.02em] text-ink">최근 자동 처리 기록</h2>
      <ul className="shadow-card mt-3 divide-y divide-line rounded-[20px] bg-card px-5">
        {(logs ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-4 py-3 text-[14px]">
            <FileText size={18} className="shrink-0 text-accent" />
            <span className="w-40 shrink-0 tabular-nums text-muted">{fmtDateTime(l.created_at)}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.reason && !l.reason.startsWith("{") ? l.reason : eventText(l)}</span>
          </li>
        ))}
        {!logs?.length && <li className="py-4 text-[14px] text-muted">아직 자동 처리 기록이 없어요.</li>}
      </ul>

      {round && me.level === "full" && (
        <>
        <div className="mt-12 flex items-center gap-3 text-[12px] font-semibold text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />여기부터 심사용 시연 도구 (실제 운영 화면이 아니에요)<span className="h-px flex-1 bg-line" />
        </div>
        <details className="group mt-4 rounded-[20px] border-2 border-dashed border-warn/40 bg-warn-soft/30 p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="flex items-center gap-2 text-[17px] font-semibold text-ink"><FlaskConical size={20} className="text-warn" />심사용 시연 패널 <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">시연 전용</span><span className="rounded-full bg-card px-2 py-0.5 text-[12px] text-muted group-open:hidden">접힘</span></span>
            <ChevronDown size={20} className="text-muted transition group-open:rotate-180" />
          </summary>
          <p className="mt-1 text-[13px] text-muted">마감 시각을 기다리지 않고 한 회차의 흐름을 처음부터 끝까지 돌려볼 수 있어요. 테스트 참가자만 만들고 바꿔요. 실제 운영에서는 숨기는 도구예요.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <form action={seedParticipants} className="shadow-card rounded-[20px] bg-card p-4">
              <input type="hidden" name="round_id" value={round.id} />
              <p className="text-[14px] font-semibold">① 테스트 참가자 만들기</p>
              <p className="mt-1 text-[12px] text-muted">운영 지역 4곳(홍대·잠실·강남·을지로) 일정에 결제까지 끝난 상태로 신청시켜요. 일부는 일부러 홍대에 몰거나 나이 차를 크게 넣어 재배치·실패 상황이 생겨요. 넷 중 하나꼴은 멤버십이라, 매칭에 실패하면 기간이 7일 늘어나는 것까지 볼 수 있어요(멤버십 비율은 시연용 가정).</p>
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

            <form action={toggleBots} className="shadow-card rounded-[20px] bg-card p-4">
              <input type="hidden" name="on" value={bots ? "0" : "1"} />
              <p className="flex items-center gap-2 text-[14px] font-semibold">시연 봇 <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${bots ? "bg-leaf-soft text-leaf" : "bg-field text-muted"}`}>{bots ? "켜짐" : "꺼짐"}</span></p>
              <p className="mt-1 text-[12px] text-muted">참가자가 결제하면 그 일정이 4명이 되도록 테스트 참가자가 같이 신청해요. 확정되면 단체방에서 성격대로 인사·대화하고, 사람이 쓴 말에 한두 명이 답해요. 모임 날엔 체크인(가끔 한 명은 안 와요)과 후기까지 남겨요.</p>
              <button className="mt-3 h-10 w-full rounded-xl border border-line bg-card text-[14px] font-semibold hover:border-accent">{bots ? "끄기" : "켜기"}</button>
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
              <ConfirmButton confirm={`'${round.title}'의 신청·테이블·후기를 모두 지우고 처음 상태로 되돌려요. 되돌릴 수 없어요. 계속할까요?`} className="text-danger underline underline-offset-4">이 회차 시연 데이터 초기화</ConfirmButton>
            </form>
          </div>
        </details>
        </>
      )}
    </div>
  );
}

const METRIC_TIP: Record<string, string> = { auto_confirm: TIP.자동확정률, intervention: TIP.개입률, ops_time: TIP.운영시간 };

// 대시보드 예외 유형 칸에 마우스를 올리면 뜨는 풀이
const TILE_TIP: Record<string, string> = {
  safety: "참가자가 보낸 신고예요. 경고·참가 제한·영구 제한 중에서 골라요.",
  payment: "결제사 승인과 우리 기록이 맞지 않는 건이에요.",
  refund: "자동 환불이 세 번 실패한 건이에요.",
  data_missing: TIP.데이터누락,
  condition_conflict: TIP.조건충돌,
  venue_shortage: TIP.식당부족,
  notification: "안내 알림이 세 번 다시 보내도 나가지 않은 건이에요.",
  no_show: TIP.노쇼후보,
  reservation: "식당 예약이 자동으로 안 됐거나, 전화로만 예약되는 식당이에요.",
};

/** 0건인 유형: 작게 한 줄로. 누르면 그 유형 목록(A2) */
function ZeroTiles({ tiles, label }: { tiles: [string, string, LucideIcon][]; label?: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 px-1 text-[13px] text-muted">
      {label && <span className="mr-1 font-semibold">{label}</span>}
      {tiles.map(([k, l]) => (
        <Link key={k} href={`/admin/exceptions?k=${k}`} title={TILE_TIP[k]} className="rounded-full border border-line bg-card px-2.5 py-1 hover:border-accent hover:text-ink">
          {l} <span className="tabular-nums">0</span>
        </Link>
      ))}
    </p>
  );
}

function Kpi({ href, I, label, value, sub, danger }: { href: string; I: LucideIcon; label: React.ReactNode; value: string; sub?: React.ReactNode; danger?: boolean }) {
  return (
    <Link href={href} className="shadow-card group flex gap-4 rounded-[20px] bg-card p-5 transition hover:-translate-y-0.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><I size={22} /></span>
      <div className="min-w-0">
        <p className="text-[14px] text-muted">{label}</p>
        <p className={`mt-0.5 text-[30px] font-bold tabular-nums tracking-[-0.03em] ${danger ? "text-danger" : "text-ink"}`}>{value}</p>
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
      </div>
      <ChevronRight size={18} className="ml-auto mt-1 shrink-0 text-muted transition group-hover:text-accent" />
    </Link>
  );
}
