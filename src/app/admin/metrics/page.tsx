import { ArrowDown, ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminModal } from "@/components/admin-modal";
import { PageHeader, Panel, TableScroll, Term, btnLight, ctl } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { requireAdmin } from "@/lib/auth";
import { CHART, FUNNEL } from "@/lib/chart-colors";
import { exceptionsHref } from "@/lib/exception-view";
import { type Metric, computeMetrics, fmtMinutes, metricValue } from "@/lib/metrics";
import { type MetricDelta, type SeriesPoint, funnel, meterPct, metricDelta, metricSeries, seriesSummary, waitingNoShow, waitingNoShowSeries } from "@/lib/metrics-series";
import { db } from "@/lib/supabase";
import { RoundBars, Sparkline } from "./charts";
import { loadMetricsInput } from "./load";

export const dynamic = "force-dynamic";

/** ③ 묶음. 맨 위 카드(매칭 성공률·자동 확정률)는 여기서 빼고 나머지 11개 */
const GROUPS: { name: string; desc: string; keys: string[] }[] = [
  { name: "획득·전환", desc: "신청을 시작한 사람이 결제와 실제 참석까지 이어지는지", keys: ["apply_complete", "pay_conversion", "attend_conversion"] },
  { name: "매칭 품질", desc: "못 앉은 사람이 다른 테이블·일정으로 이어지는지, 확정된 사람이 오는지", keys: ["realloc_success", "alt_conversion", "no_show"] },
  { name: "반복 참여·운영 효율", desc: "다시 오고 후기를 남기는지, 운영자 손이 얼마나 가는지", keys: ["revisit", "feedback", "auto_refund", "intervention", "ops_time"] },
];

const TERM_TIP: Record<string, string> = { auto_confirm: TIP.자동확정률, intervention: TIP.개입률, ops_time: TIP.운영시간, realloc_success: TIP.재배치 };

const card = "flex w-full flex-col rounded-[20px] border border-line bg-card text-left transition hover:border-accent/40 hover:bg-row focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20";

export default async function Metrics({ searchParams }: { searchParams: Promise<{ r?: string; demo?: string }> }) {
  await requireAdmin();
  const { r, demo } = await searchParams;
  const excludeDemo = demo === "0";
  const [{ data: rounds }, input] = await Promise.all([db().from("rounds").select("id,title,match_at").order("match_at"), loadMetricsInput({ excludeDemo })]);
  const round = rounds?.find((x) => x.id === r);
  const metrics = computeMetrics(input, round?.id);
  const series = metricSeries(input, rounds ?? []);
  const titles = new Map((rounds ?? []).map((x) => [x.id, x.title]));
  const mk = (k: string) => metrics.find((m) => m.key === k)!;
  const sr = (k: string) => series[k] ?? [];

  const noShowWait = waitingNoShow(input, round?.id);
  const noShowSeries = waitingNoShowSeries(input, sr("no_show"));
  const noShowDelta = metricDelta({ unit: "count", higherIsBetter: false }, noShowSeries, round?.id);
  const flow = funnel(metrics);
  const scope = round ? round.title : "전체 회차 누적";

  return (
    <div>
      <PageHeader
        title="운영 지표"
        desc="위에서부터 먼저 볼 순서예요. 카드나 줄을 누르면 정의와 회차별 숫자가 열려요."
        how={["전체 누적이나 한 회차 고르기", <>맨 위 <Term tip={TIP.자동확정률}>자동 확정률</Term>·노쇼 후보부터 보기</>, "숫자가 이상하면 눌러서 '세는 법' 읽기"]}
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <select name="r" defaultValue={round?.id ?? ""} className={`${ctl} max-w-full`} aria-label="회차">
              <option value="">전체 회차 누적</option>
              {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" name="demo" value="0" defaultChecked={excludeDemo} className="size-4" />시연 데이터 빼기</label>
            <button className={btnLight}>보기</button>
          </form>
        }
      />
      <p className="mt-3 text-[13px] text-muted">
        {excludeDemo
          ? `시연 계정(테스트 참가자·봇) 신청 ${input.demoApps}건과 거기 걸린 예외·후기를 빼고 셌어요.`
          : input.demoApps
            ? `시연 계정(테스트 참가자·봇) 신청 ${input.demoApps}건도 함께 셌어요. 실제 회원만 보려면 '시연 데이터 빼기'를 고르세요.`
            : "모두 실제 회원 데이터예요."}
      </p>
      {round && <p className="mt-1 text-[13px] text-muted">{round.title}만 봐요. 재방문율은 이 회차 참가자가 그 뒤 회차에 다시 신청했는지 봐요. 노쇼 반복·알림처럼 회차를 알 수 없는 예외는 개입률에서 빠져요.</p>}

      {/* ① 지금 먼저 볼 것 */}
      <section aria-labelledby="h-now" className="mt-8">
        <SectionTitle id="h-now" n={1} title="지금 먼저 볼 것" sub={scope} />
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(["match_success", "auto_confirm"] as const).map((k) => {
            const m = mk(k);
            const s = sr(k);
            return (
              <AdminModal key={k} title={m.name} desc={<DirectionNote m={m} />} wide triggerClassName={`${card} gap-2 p-5`} label={
                <>
                  <span className="text-[14px] font-semibold text-muted">{m.name}</span>
                  <BigValue m={m} />
                  <DeltaLine d={metricDelta(m, s, round?.id)} />
                  <span className="text-[13px] text-muted">{m.numeratorLabel} {n(m.numerator)} ÷ {m.denominatorLabel} {n(m.denominator)}</span>
                  <span className="mt-1 block"><Sparkline points={s} unit={m.unit} tone={m.higherIsBetter ? "good" : "bad"} /></span>
                  <span className="sr-only">{seriesSummary(m, s)}</span>
                  <More />
                </>
              }>
                <MetricDetail m={m} series={s} highlight={round?.id} titles={titles} />
              </AdminModal>
            );
          })}

          {/* 노쇼 후보: 처리할 일이라 예외 처리함으로 바로 가는 길을 함께 둔다 */}
          <div className={`flex flex-col rounded-[20px] border ${noShowWait ? "border-danger/35" : "border-line"} bg-card`}>
            <AdminModal title="노쇼 후보·노쇼율" desc={<DirectionNote m={mk("no_show")} />} wide triggerClassName="flex w-full flex-1 flex-col gap-2 rounded-t-[20px] p-5 pb-3 text-left transition hover:bg-row focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20" label={
              <>
                <span className={`text-[14px] font-semibold ${noShowWait ? "text-danger" : "text-muted"}`}>확인 기다리는 <Term inLink tip={TIP.노쇼후보}>노쇼 후보</Term></span>
                <span className={`text-[44px] font-bold leading-none tracking-[-0.03em] ${noShowWait ? "text-danger" : "text-ink"}`}>{n(noShowWait)}<span className="ml-0.5 text-[22px]">명</span></span>
                <DeltaLine d={noShowDelta} />
                <span className="text-[13px] text-muted">{noShowWait ? "노쇼로 확정하거나 참석으로 고쳐야 노쇼율이 정확해져요" : "확인할 후보가 없어요"}</span>
                <span className="mt-1 block"><Sparkline points={noShowSeries} unit="count" tone="bad" /></span>
                <span className="sr-only">{`회차별 확인 기다리는 노쇼 후보: ${noShowSeries.map((p) => `${p.title} ${p.value}명`).join(", ") || "없음"}`}</span>
                <More text="노쇼율 자세히" />
              </>
            }>
              <p className="mb-4 rounded-2xl bg-field px-4 py-3 text-[14px] text-ink2">지금 확인을 기다리는 노쇼 후보 <b className="text-ink">{n(noShowWait)}명</b> ({scope}). 확인이 끝나야 아래 노쇼율에 들어가요.</p>
              <MetricDetail m={mk("no_show")} series={sr("no_show")} highlight={round?.id} titles={titles} />
            </AdminModal>
            <Link href={exceptionsHref({ k: "no_show" })} className="mx-5 mb-4 flex items-center justify-between border-t border-line2 pt-3 text-[13px] font-semibold text-accent-text hover:underline">
              예외 처리함에서 확인하기 <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ② 깔때기 */}
      <section aria-labelledby="h-flow" className="mt-8 rounded-[20px] border border-line bg-card p-5 sm:p-6">
        <SectionTitle id="h-flow" n={2} title="신청부터 후기까지 몇 명이 남았나" sub={scope} />
        <p className="mt-1 text-[13px] text-muted">막대 길이는 신청한 사람 대비 인원이에요. 오른쪽 아래 숫자는 앞 단계에서 넘어온 비율이에요.</p>
        <ol className="mt-5 space-y-2.5" aria-label="단계별 인원">
          {flow.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[56px_minmax(0,1fr)_120px]">
              <span className="text-[14px] font-semibold text-ink">{s.label}</span>
              <span className="h-7 overflow-hidden rounded-lg bg-line2" title={`${s.label} ${n(s.count)}명${s.fromPrev !== null ? ` · 앞 단계의 ${pct(s.fromPrev)}` : ""}`}>
                <span className="block h-full rounded-lg" style={{ width: s.count ? `max(4px, ${s.share * 100}%)` : 0, background: FUNNEL[i] }} />
              </span>
              <span className="text-right leading-tight">
                <span className="block text-[15px] font-bold tabular-nums text-ink">{n(s.count)}명</span>
                <span className="block text-[12px] tabular-nums text-muted">{s.fromPrev === null ? (i === 0 ? "시작" : "—") : `앞 단계의 ${pct(s.fromPrev)}`}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed text-faint">신청=제출한 신청, 결제=결제 완료(이후 환불 포함), 확정=테이블이 한 번이라도 확정된 사람, 참석=체크인, 후기=후기 제출. 참석·후기는 모임이 끝난 뒤에 채워져요.</p>
      </section>

      {/* ③ 나머지 지표 */}
      <section aria-labelledby="h-rest" className="mt-8">
        <SectionTitle id="h-rest" n={3} title="나머지 지표" sub="묶음별" />
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.name} className="rounded-[20px] border border-line bg-card p-2">
              <div className="px-3 pb-1 pt-3">
                <h3 className="text-[16px] font-bold text-ink">{g.name}</h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{g.desc}</p>
              </div>
              <ul>
                {g.keys.map((k) => {
                  const m = mk(k);
                  return (
                    <li key={k}>
                      <AdminModal title={m.name} desc={<DirectionNote m={m} />} wide triggerClassName="flex w-full flex-col gap-1.5 rounded-2xl px-3 py-3 text-left transition hover:bg-row focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20" label={<MetricRow m={m} />}>
                        <MetricDetail m={m} series={sr(k)} highlight={round?.id} titles={titles} />
                      </AdminModal>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <Panel title="이 숫자를 읽는 법" className="mt-8 border border-line">
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink/80">
          <li>분모가 0이면 &lsquo;아직 데이터 없음&rsquo;으로 둬요. 0%와 구분하려고요.</li>
          <li>&lsquo;지난 회차보다&rsquo;는 회차를 골랐으면 그 회차와 바로 앞 회차를, 전체 누적이면 숫자가 있는 마지막 두 회차를 비교해요. 초록은 좋아진 쪽, 빨강은 나빠진 쪽이에요.</li>
          <li>&lsquo;운영자가 손댔다&rsquo;는 상태 이력에 운영자 이름으로 남은 변경(이동·분리·병합·해제·환불 재시도)을 말해요. 시연 도구가 바꾼 것은 운영자 개입으로 세지 않아요.</li>
          <li>운영 시간은 운영자가 실제로 일한 시간이 아니라, 예외가 올라온 뒤 처리될 때까지 걸린 시간이에요. 길면 예외가 오래 방치됐다는 뜻이에요.</li>
        </ul>
      </Panel>
    </div>
  );
}

const n = (x: number) => x.toLocaleString("ko-KR");
const pct = (x: number) => `${Math.round(x * 100)}%`;

function SectionTitle({ id, n: num, title, sub }: { id: string; n: number; title: string; sub?: string }) {
  return (
    <h2 id={id} className="flex flex-wrap items-baseline gap-x-2 text-[20px] font-bold tracking-[-0.02em] text-ink">
      <span className="flex size-6 shrink-0 translate-y-[-2px] items-center justify-center self-center rounded-full bg-accent-soft text-[13px] text-accent-text">{num}</span>
      {title}
      {sub && <span className="text-[13px] font-medium text-muted">{sub}</span>}
    </h2>
  );
}

function BigValue({ m }: { m: Metric }) {
  const v = metricValue(m);
  return v ? <span className="text-[44px] font-bold leading-none tracking-[-0.03em] text-ink">{v}</span> : <span className="py-2 text-[18px] font-semibold text-muted">아직 데이터 없음</span>;
}

function More({ text = "자세히 보기" }: { text?: string }) {
  return <span className="mt-auto flex items-center gap-0.5 pt-1 text-[13px] font-semibold text-accent-text">{text}<ChevronRight size={15} aria-hidden="true" /></span>;
}

/** 지난 회차와 차이. 화살표는 숫자 방향, 색은 좋아졌는지(지표 방향에 따라) */
function DeltaLine({ d }: { d: MetricDelta | null }) {
  if (!d) return <span className="text-[13px] text-faint">비교할 지난 회차가 아직 없어요</span>;
  if (d.diff === 0) return <span className="flex items-center gap-1 text-[13px] text-muted"><Minus size={15} aria-hidden="true" />지난 회차와 같아요</span>;
  const Icon = d.diff > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = d.better ? "text-accent-text" : "text-danger";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
      <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${tone}`}><Icon size={15} aria-hidden="true" />{d.text}</span>
      <span className="text-muted">지난 회차보다</span>
      <span className="sr-only">{d.better ? "(좋아졌어요)" : "(나빠졌어요)"}</span>
    </span>
  );
}

function DirectionNote({ m }: { m: Metric }) {
  return <>{m.higherIsBetter ? "높을수록 좋은 지표예요." : "낮을수록 좋은 지표예요."} {m.group} 묶음</>;
}

function LowerBadge() {
  return <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-danger"><ArrowDown size={11} aria-hidden="true" />낮을수록 좋음</span>;
}

/** ③ 묶음 안 한 줄: 이름 · 값 · 막대(비율) · 분자÷분모 */
function MetricRow({ m }: { m: Metric }) {
  const v = metricValue(m);
  const p = meterPct(m);
  const good = m.higherIsBetter;
  return (
    <>
      <span className="flex w-full items-start justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink">
          {TERM_TIP[m.key] ? <Term inLink tip={TERM_TIP[m.key]}>{m.name}</Term> : m.name}
          {!good && <LowerBadge />}
        </span>
        {v ? <span className="shrink-0 text-[18px] font-bold tabular-nums text-ink">{v}</span> : <span className="shrink-0 pt-0.5 text-[13px] font-semibold text-muted">아직 데이터 없음</span>}
      </span>
      {m.unit === "ratio" ? (
        <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: good ? CHART.accentTrack : CHART.dangerTrack }} aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${p ?? 0}%`, background: good ? CHART.accent : CHART.danger }} />
        </span>
      ) : m.sub ? (
        <span className="text-[12px] font-semibold text-ink2">{m.sub}</span>
      ) : null}
      <span className="text-[12px] tabular-nums text-muted">{m.numeratorLabel} {n(m.numerator)} ÷ {m.denominatorLabel} {n(m.denominator)}</span>
    </>
  );
}

/** 모달 본문: 정의 → 분자·분모 → 회차별 막대 → 회차별 표 */
function MetricDetail({ m, series, highlight, titles }: { m: Metric; series: SeriesPoint[]; highlight?: string; titles: Map<string, string> }) {
  const v = metricValue(m);
  const fmt = (p: SeriesPoint) => (p.value === null ? null : metricValue({ ...m, value: p.value }));
  const summary = seriesSummary(m, series);
  return (
    <div className="space-y-5">
      <dl className="space-y-2 text-[14px] leading-relaxed">
        <div><dt className="text-[12px] font-semibold text-muted">정의 (PRD)</dt><dd className="text-ink">{m.definition}</dd></div>
        <div><dt className="text-[12px] font-semibold text-muted">세는 법</dt><dd className="text-ink2">{m.how}</dd></div>
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-2xl bg-field px-4 py-3 text-[14px]">
        <span className="text-muted">{m.numeratorLabel}</span><b className="text-right tabular-nums text-ink">{n(m.numerator)}</b>
        <span className="text-muted">{m.denominatorLabel}</span><b className="text-right tabular-nums text-ink">{n(m.denominator)}</b>
        <span className="border-t border-line pt-2 font-semibold text-ink">{highlight ? titles.get(highlight) ?? "이 회차" : "전체 누적"}</span>
        <b className={`border-t border-line pt-2 text-right ${v ? "text-[18px] text-ink" : "text-muted"}`}>{v ?? "아직 데이터 없음"}</b>
        {m.sub && <span className="col-span-2 text-[13px] font-semibold text-ink2">{m.sub}</span>}
      </div>

      <section aria-label="회차별">
        <h3 className="text-[15px] font-bold text-ink">회차별</h3>
        {series.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">아직 신청이 들어온 회차가 없어요.</p>
        ) : (
          <>
            <div className="mt-2"><RoundBars points={series.map((p) => ({ roundId: p.roundId, title: p.title, value: p.value }))} unit={m.unit} tone={m.higherIsBetter ? "good" : "bad"} summary={summary} highlight={highlight} /></div>
            <TableScroll>
              <table className="mt-2 w-full text-[13px]">
                <caption className="sr-only">{m.name} 회차별 값</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">회차</th>
                    <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-semibold">분자 ÷ 분모</th>
                    <th scope="col" className="py-2 text-right font-semibold">값</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((p) => (
                    <tr key={p.roundId} className={`border-b border-line2 ${p.roundId === highlight ? "bg-accent-soft/60 font-semibold" : ""}`}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-ink2">{p.title}</th>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-muted">{n(p.numerator)} ÷ {n(p.denominator)}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-ink">{fmt(p) ?? <span className="text-muted">아직 데이터 없음</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </section>

      {m.perRound && m.perRound.length > 0 && (
        <section aria-label="회차별 처리 시간 합계">
          <h3 className="text-[15px] font-bold text-ink">회차별 처리 시간 합계</h3>
          <ul className="mt-2 space-y-1 rounded-2xl bg-field px-4 py-3 text-[13px]">
            {m.perRound.map((x) => (
              <li key={x.roundId} className="flex justify-between gap-3 tabular-nums"><span className="min-w-0 truncate text-ink2">{titles.get(x.roundId) ?? "알 수 없는 회차"}</span><span className="shrink-0 font-semibold text-ink">{fmtMinutes(x.minutes)} · {x.count}건</span></li>
            ))}
          </ul>
        </section>
      )}
      <ToneLegend good={m.higherIsBetter} />
    </div>
  );
}

function ToneLegend({ good }: { good: boolean }): ReactNode {
  return (
    <p className="flex items-center gap-2 text-[12px] text-muted">
      <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: good ? CHART.accent : CHART.danger }} />
      {good ? "초록 막대: 높을수록 좋은 지표" : "빨간 막대: 낮을수록 좋은 지표"}
    </p>
  );
}
