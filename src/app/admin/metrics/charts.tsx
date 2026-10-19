"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/chart-colors";
import { fmtMinutes } from "@/lib/metrics";

export interface ChartPoint {
  roundId?: string;
  title: string;
  value: number | null;
}
type Unit = "ratio" | "minutes" | "count";
type Tone = "good" | "bad";

const fmt = (unit: Unit, v: number) => (unit === "ratio" ? `${Math.round(v * 1000) / 10}%` : unit === "count" ? `${v.toLocaleString("ko-KR")}명` : fmtMinutes(v));
const short = (t: string) => t.replace(/\s*\(.*\)\s*$/, "");
/** 축 글자: '10월 넷째 주 저녁' → '10월 넷째 주' (좁은 폭에서 잘리지 않게. 전체 이름은 툴팁·표에) */
const tick = (t: string) => short(t).match(/^\d+월 \S+ 주/)?.[0] ?? short(t);

function Tip({ active, payload, unit }: { active?: boolean; payload?: { payload: ChartPoint }[]; unit: Unit }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg">
      <p className="text-white/70">{short(p.title)}</p>
      <p className="mt-0.5 text-[14px] font-bold">{p.value === null ? "데이터 없음" : fmt(unit, p.value)}</p>
    </div>
  );
}

/** 카드 안 회차 추이. 카드 자체가 버튼이라 차트는 초점을 받지 않고(값은 카드 글과 모달 표에 있다) 마우스 툴팁만 붙인다 */
export function Sparkline({ points, unit, tone }: { points: ChartPoint[]; unit: Unit; tone: Tone }) {
  const color = tone === "good" ? CHART.accent : CHART.danger;
  const last = points.reduce((n, p, i) => (p.value !== null ? i : n), -1);
  if (points.filter((p) => p.value !== null).length < 2) {
    return <p className="flex h-12 items-center text-[12px] text-faint">회차가 둘 이상 쌓이면 추이가 보여요</p>;
  }
  return (
    <div aria-hidden="true" className="h-12 w-full">
      <LineChart responsive width="100%" height={48} data={points} margin={{ top: 6, right: 6, bottom: 6, left: 6 }} accessibilityLayer={false}>
        <YAxis hide domain={unit === "ratio" ? [0, 1] : [0, "auto"]} />
        <Tooltip content={<Tip unit={unit} />} cursor={{ stroke: CHART.grid, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: "none", zIndex: 10 }} />
        <Line
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          connectNulls
          isAnimationActive={false}
          dot={(d: { index?: number; cx?: number; cy?: number }) =>
            d.index === last && d.cx != null && d.cy != null ? <circle key="end" cx={d.cx} cy={d.cy} r={4} fill={color} stroke={CHART.surface} strokeWidth={2} /> : <g key={d.index} />
          }
          activeDot={{ r: 5, fill: color, stroke: CHART.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </div>
  );
}

/** 모달 안 회차별 막대. 키보드(←→)로 막대를 옮기며 툴팁을 볼 수 있고, 같은 값이 아래 표에도 있다 */
export function RoundBars({ points, unit, tone, summary, highlight }: { points: ChartPoint[]; unit: Unit; tone: Tone; summary: string; highlight?: string }) {
  const color = tone === "good" ? CHART.accent : CHART.danger;
  // 회차를 골랐으면 그 회차만 진하게, 나머지는 같은 색의 연한 단계
  const dim = tone === "good" ? CHART.accentDim : CHART.dangerDim;
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  // 비율 축: 값이 작으면(노쇼율·개입률 등) 0~100%로 두면 막대가 안 보이니 10% 단위로 줄인다
  const top = unit === "ratio" ? (max >= 0.5 ? 1 : Math.max(0.1, Math.ceil(max * 10) / 10)) : max || 1;
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="h-[220px] w-full [&_.recharts-surface:focus-visible]:rounded-lg [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-accent/50 [&_.recharts-surface]:outline-none">
        <BarChart responsive width="100%" height={220} data={points.map((p) => ({ ...p, label: tick(p.title) }))} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} desc={summary} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.axis }} tick={{ fontSize: 11, fill: CHART.text }} interval="preserveStartEnd" minTickGap={8} height={28} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: CHART.text }}
            domain={[0, top]}
            ticks={unit === "ratio" ? [0, 0.25, 0.5, 0.75, 1].map((t) => t * top) : undefined}
            tickFormatter={(v: number) => (unit === "ratio" ? `${Math.round(v * 1000) / 10}%` : fmt(unit, v))}
          />
          <Tooltip content={<Tip unit={unit} />} cursor={{ fill: CHART.wash }} isAnimationActive={false} wrapperStyle={{ outline: "none" }} />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {points.map((p, i) => <Cell key={i} fill={!highlight || p.roundId === highlight ? color : dim} />)}
          </Bar>
        </BarChart>
      </div>
    </figure>
  );
}
