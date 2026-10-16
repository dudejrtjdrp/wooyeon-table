import { PageHeader, Panel, btnLight, ctl } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { type Metric, type MetricGroup, computeMetrics, fmtMinutes, metricValue } from "@/lib/metrics";
import { db } from "@/lib/supabase";
import { loadMetricsInput } from "./load";

export const dynamic = "force-dynamic";

const GROUPS: { g: MetricGroup; desc: string }[] = [
  { g: "운영 효율", desc: "정상 흐름이 운영자 손 없이 끝나는지. 자동 확정률은 높을수록, 개입률과 운영 시간은 낮을수록 좋아요." },
  { g: "획득·전환", desc: "신청을 시작한 사람이 결제와 실제 참석까지 이어지는지." },
  { g: "매칭 품질", desc: "결제한 사람이 테이블에 앉는지, 못 앉은 사람이 다음 일정으로 이어지는지." },
  { g: "반복 참여", desc: "한 번 온 사람이 다시 오고 후기를 남기는지. 후기는 다음 매칭에 들어가요." },
];

export default async function Metrics({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const { r } = await searchParams;
  const [{ data: rounds }, input] = await Promise.all([db().from("rounds").select("id,title").order("match_at"), loadMetricsInput()]);
  const round = rounds?.find((x) => x.id === r);
  const metrics = computeMetrics(input, round?.id);
  const titles = new Map((rounds ?? []).map((x) => [x.id, x.title]));

  return (
    <div>
      <PageHeader
        title="운영 지표"
        desc="PRD에서 정한 핵심 지표 13개예요. 각 지표 아래에 무엇을 무엇으로 나눴는지 적어 두었어요. 시연용 테스트 참가자도 함께 세요."
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <select name="r" defaultValue={round?.id ?? ""} className={ctl} aria-label="회차">
              <option value="">전체 회차 누적</option>
              {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <button className={btnLight}>보기</button>
          </form>
        }
      />
      {round && <p className="mt-3 text-[13px] text-muted">{round.title}만 봐요. 재방문율은 이 회차 참가자가 그 뒤 회차에 다시 신청했는지 봐요. 노쇼 반복·알림처럼 회차를 알 수 없는 예외는 개입률에서 빠져요.</p>}

      <div className="mt-6 space-y-6">
        {GROUPS.map(({ g, desc }) => (
          <section key={g}>
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{g}</h2>
            <p className="mt-1 text-[13px] text-muted">{desc}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {metrics.filter((m) => m.group === g).map((m) => <MetricCard key={m.key} m={m} titles={titles} />)}
            </div>
          </section>
        ))}
      </div>

      <Panel title="이 숫자를 읽는 법" className="mt-8">
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink/80">
          <li>분모가 0이면 &lsquo;아직 데이터 없음&rsquo;으로 둬요. 0%와 구분하려고요.</li>
          <li>&lsquo;운영자가 손댔다&rsquo;는 상태 이력에 운영자 이름으로 남은 변경(이동·분리·병합·해제·환불 재시도)을 말해요. 시연 도구가 바꾼 것은 운영자 개입으로 세지 않아요.</li>
          <li>운영 시간은 운영자가 실제로 일한 시간이 아니라, 예외가 올라온 뒤 처리될 때까지 걸린 시간이에요. 길면 예외가 오래 방치됐다는 뜻이에요.</li>
        </ul>
      </Panel>
    </div>
  );
}

function MetricCard({ m, titles }: { m: Metric; titles: Map<string, string> }) {
  const v = metricValue(m);
  return (
    <article className="shadow-card flex flex-col rounded-[20px] bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[16px] font-bold text-ink">{m.name}</h3>
        <span className="shrink-0 text-[12px] text-muted">{m.higherIsBetter ? "높을수록 좋음" : "낮을수록 좋음"}</span>
      </div>
      {v ? (
        <p className="mt-2 text-[30px] font-bold tabular-nums tracking-[-0.03em] text-ink">{v}</p>
      ) : (
        <p className="mt-2 py-2 text-[17px] font-semibold text-muted">아직 데이터 없음</p>
      )}
      <p className="text-[13px] tabular-nums text-muted">
        {m.numeratorLabel} {m.numerator.toLocaleString("ko-KR")} ÷ {m.denominatorLabel} {m.denominator.toLocaleString("ko-KR")}
      </p>
      {m.sub && <p className="text-[13px] font-semibold text-ink/80">{m.sub}</p>}
      {m.perRound && m.perRound.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-xl bg-field px-3 py-2 text-[13px]">
          <li className="text-[12px] text-muted">회차별 처리 시간 합계</li>
          {m.perRound.map((x) => (
            <li key={x.roundId} className="flex justify-between gap-3 tabular-nums"><span className="truncate text-ink/80">{titles.get(x.roundId) ?? "알 수 없는 회차"}</span><span className="shrink-0 font-semibold text-ink">{fmtMinutes(x.minutes)} · {x.count}건</span></li>
          ))}
        </ul>
      )}
      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] leading-relaxed">
        <div><dt className="inline font-semibold text-ink">정의 </dt><dd className="inline text-ink/80">{m.definition}</dd></div>
        <div><dt className="inline font-semibold text-ink">세는 법 </dt><dd className="inline text-muted">{m.how}</dd></div>
      </dl>
    </article>
  );
}
