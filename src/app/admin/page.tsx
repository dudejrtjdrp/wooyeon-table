import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { tick } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { autoAttend, moveClock, reapply, resetRound, runTick, seedParticipants } from "./demo-actions";

export const dynamic = "force-dynamic";

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

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "accent" }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`mt-1 text-[26px] font-bold ${tone === "accent" ? "text-accent" : ""}`}>{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ r?: string; m?: string }> }) {
  await requireAdmin();
  await tick().catch(() => null);
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">
            지금 {fmtDateTime(t.toISOString())}
            {Number(clock?.offset_seconds) ? <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-accent">시연용 가상 시각</span> : null}
          </p>
          <h1 className="mt-1 text-[24px] font-bold">오늘 처리할 일</h1>
        </div>
        <form className="flex items-center gap-2">
          <select name="r" defaultValue={round?.id} className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">
            {rounds?.map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
          <button className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">보기</button>
        </form>
      </div>

      {m && <p className="mt-4 rounded-lg bg-leaf/10 px-4 py-3 text-[14px] text-leaf">{m}</p>}

      {round && (
        <>
          <p className="mt-6 text-[14px] text-muted">
            {round.title} · 매칭 {fmtDateTime(round.match_at)} ·{" "}
            {round.status === "open" ? "모집 중" : round.status === "matched" ? "매칭 완료" : round.status}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="신청" value={list.length} sub={`결제 완료 ${paid.length}`} />
            <Stat label="자동 매칭 성공" value={matchRate === null ? "-" : `${matchRate}%`} sub={`${confirmed.length}명 · 테이블 ${tableCount ?? 0}개`} />
            <Stat label="자동 재배치로 확정" value={reallocated.length} sub="처음 조합이 안 맞아 옮긴 사람" />
            <Stat label="대체 일정·환불 선택 대기" value={waitingChoice.length} tone={waitingChoice.length ? "accent" : undefined} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="참석" value={attended.length} />
            <Stat label="운영자 개입 필요" value={ex?.length ?? 0} tone={ex?.length ? "accent" : undefined} sub="자동으로 못 푼 건" />
            <Stat label="매칭 실행" value={run ? (run.status === "done" ? "완료" : run.status) : "대기"} sub={run?.finished_at ? fmtDateTime(run.finished_at) : undefined} />
            <Stat label="자동 확정률" value={confirmed.length ? "100%" : "-"} sub="운영자 승인 없이 확정" />
          </div>
        </>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">자동으로 안 풀린 것</h2>
          <Link href="/admin/exceptions" className="text-[14px] underline underline-offset-4">예외 처리함 →</Link>
        </div>
        {ex?.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[...exCount.entries()].map(([k, v]) => (
              <li key={k} className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-[13px] text-accent">{KIND_LABEL[k] ?? k}</p>
                <p className="text-[20px] font-bold">{v}건</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-line bg-card px-4 py-6 text-center text-[14px] text-muted">지금은 운영자가 볼 일이 없어요. 모두 자동으로 처리됐어요.</p>
        )}
      </section>

      {round && (
        <section className="mt-10 rounded-2xl border-2 border-dashed border-line p-5">
          <h2 className="text-[17px] font-semibold">시연 패널</h2>
          <p className="mt-1 text-[13px] text-muted">마감 시각을 기다리지 않고 한 회차의 흐름을 처음부터 끝까지 돌려볼 수 있어요. 실제 운영에서는 숨기는 화면이에요.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <form action={seedParticipants} className="rounded-xl bg-card p-4">
              <input type="hidden" name="round_id" value={round.id} />
              <p className="text-[14px] font-semibold">① 테스트 참가자 만들기</p>
              <p className="mt-1 text-[12px] text-muted">결제까지 끝난 상태로 신청시켜요. 일부는 일부러 홍대에 몰거나 나이 차를 크게 넣어 재배치·실패 상황이 생겨요.</p>
              <div className="mt-3 flex gap-2">
                <input name="count" type="number" defaultValue={36} min={4} max={60} className="w-20 rounded-lg border border-line px-3 py-2 text-[14px]" />
                <button className="flex-1 rounded-lg bg-ink py-2 text-[14px] font-semibold text-white">만들기</button>
              </div>
            </form>

            <div className="rounded-xl bg-card p-4">
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
                    <button className="w-full rounded-lg border border-line py-2 text-[13px]">{label}</button>
                  </form>
                ))}
              </div>
              <form action={moveClock} className="mt-2">
                <input type="hidden" name="to" value="reset" />
                <button className="w-full text-[12px] text-muted underline underline-offset-4">실제 시각으로 돌아가기</button>
              </form>
            </div>

            <form action={autoAttend} className="rounded-xl bg-card p-4">
              <input type="hidden" name="round_id" value={round.id} />
              <p className="text-[14px] font-semibold">③ 테스트 참가자 체크인·후기 채우기</p>
              <p className="mt-1 text-[12px] text-muted">일부는 서로 &lsquo;다시는 싫어요&rsquo;를 골라요. 다음 매칭에서 같은 테이블에 앉지 않는지 볼 수 있어요.</p>
              <button className="mt-3 w-full rounded-lg bg-ink py-2 text-[14px] font-semibold text-white">채우기</button>
            </form>

            {nextRound && (
              <form action={reapply} className="rounded-xl bg-card p-4">
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="next_round_id" value={nextRound.id} />
                <p className="text-[14px] font-semibold">④ 다음 차수에 다시 신청시키기</p>
                <p className="mt-1 text-[12px] text-muted">{nextRound.title}에 참석자들을 다시 넣어요. 그 차수를 매칭하면 이전 만남과 비선호가 반영돼요.</p>
                <button className="mt-3 w-full rounded-lg bg-ink py-2 text-[14px] font-semibold text-white">다시 신청시키기</button>
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
        </section>
      )}
    </div>
  );
}
