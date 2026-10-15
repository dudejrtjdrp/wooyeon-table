import { ChevronDown, Heart, Settings2, Sparkles, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, btnLight, ctl, th } from "@/components/admin-ui";
import { MATCH, TABLE, label } from "@/lib/labels";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import type { ScoreDetail } from "@/lib/matching/types";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PART_LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };

export default async function MatchingMonitor({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const { r } = await searchParams;
  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.find((x) => x.status === "matched") ?? rounds?.[0];
  if (!round) return <p>회차가 없어요.</p>;

  const { data: run } = await db().from("match_runs").select("*").eq("round_id", round.id).maybeSingle();
  const { data: tablesRaw } = await db()
    .from("dining_tables")
    .select("id,status,score,score_detail,explanation,confirmed_at,reservation_name,slots(region,starts_at),venues(name,address),chat_rooms(id)")
    .eq("round_id", round.id)
    .order("created_at");
  const tables = (tablesRaw ?? []) as unknown as {
    id: string; status: string; score: number; score_detail: ScoreDetail; explanation: { reasons?: string[]; origin?: string };
    confirmed_at: string; reservation_name: string | null; slots: { region: string; starts_at: string }; venues: { name: string; address: string } | null; chat_rooms: { id: string }[] | { id: string } | null;
  }[];
  const { data: appsRaw } = await db()
    .from("applications")
    .select("id,table_id,match_status,realloc_count,match_reason,users(name,profiles(birth_year,gender,mbti))")
    .eq("round_id", round.id);
  const apps = (appsRaw ?? []) as unknown as {
    id: string; table_id: string | null; match_status: string; realloc_count: number; match_reason: string | null;
    users: { name: string; profiles: { birth_year: number; gender: string; mbti: string | null } | null };
  }[];
  const failed = apps.filter((a) => ["ALTERNATIVE_OFFERED", "EXCEPTION", "TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.table_id);
  const summary = (run?.summary ?? {}) as Record<string, unknown> & { log?: string[] };

  const st = (k: string) => Number((summary as Record<string, unknown>)[k] ?? 0);
  const REASON_TONE = ["bg-accent-soft text-accent", "bg-leaf/10 text-leaf", "bg-[#f0ecfd] text-[#6a4fd6]"];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">자동 매칭 모니터</h1>
          <p className="mt-1.5 text-[15px] text-muted">신청자 정보로 마감 시각에 자동으로 꾸린 테이블과 그 이유예요.</p>
        </div>
        <form className="flex gap-2">
          <select name="r" defaultValue={round.id} className={ctl}>
            {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
          <button className={btnLight}>보기</button>
        </form>
      </div>

      {!run ? (
        <p className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center text-muted">
          아직 매칭 전이에요. {fmtDateTime(round.match_at)}에 자동으로 실행돼요.
        </p>
      ) : (
        <details className="shadow-card group mt-6 rounded-[20px] bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Settings2 size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-accent">실행 요약</span>
              <span className="mt-0.5 block text-[14px] text-[#4c5368]">
                {fmtDateTime(run.started_at)} 실행 · 알고리즘 {run.algorithm_version} · 대상 {run.candidate_count}명 → 확정 {st("confirmed")}명 / 테이블 {tables.length}개 / 재배치 {st("reallocated")}명 / 병합 {st("merged")} / 해제 {st("dissolved")} / 대안 안내 {st("failed")}명{st("exceptions") ? ` / 데이터 예외 ${st("exceptions")}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-1 border-l border-line pl-4 text-[14px] font-semibold text-accent">처리 기록 보기 <ChevronDown size={18} className="transition group-open:rotate-180" /></span>
          </summary>
          <ol className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-6 py-4 text-[13px] text-muted">{(summary.log ?? []).map((l, i) => <li key={i}>{l}</li>)}</ol>
        </details>
      )}

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {tables.map((t) => {
            const d = t.score_detail;
            const members = apps.filter((a) => a.table_id === t.id);
            const reasons = t.explanation.reasons ?? [];
            return (
              <article key={t.id} className="shadow-card rounded-[20px] bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[24px] font-bold tracking-[-0.03em] text-ink">{fmtDay(t.slots.starts_at)} · {t.slots.region} <span className="text-[15px] font-medium text-muted">{fmtTime(t.slots.starts_at)}</span></h2>
                  <Badge v={label(TABLE, t.status)} />
                </div>
                <div className="mt-4 rounded-[18px] border border-line p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[21px] font-bold text-ink">{t.venues?.name ?? "식당 미배정"} · {members.length}명</p>
                      <p className="mt-1 text-[14px] text-muted">{t.venues?.address ?? "예외 처리함에서 식당을 다시 배정할 수 있어요"}{t.reservation_name ? ` · 예약명 ${t.reservation_name}` : ""}</p>
                    </div>
                    <div className="rounded-2xl bg-accent-soft/60 px-5 py-3 text-right">
                      <p className="text-[12px] text-muted">매칭 점수</p>
                      <p className="text-[30px] font-bold leading-tight text-accent">{Math.round(Number(t.score))}<span className="text-[16px] font-semibold"> / 100</span></p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                    <table className="w-full text-[14px]">
                      <thead><tr>{["이름", "출생연도", "성별", "MBTI", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-line">
                        {members.map((mb) => (
                          <tr key={mb.id}>
                            <td className="px-4 py-2.5 font-medium text-ink">{mb.users.name}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[#4c5368]">{mb.users.profiles?.birth_year}</td>
                            <td className="px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.gender === "M" ? "남" : "여"}</td>
                            <td className="px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.mbti ?? "-"}</td>
                            <td className="px-2 py-2.5">{mb.realloc_count > 0 && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">재배치</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ul className="space-y-3.5 self-center">
                      {Object.entries(d.parts).map(([k, v]) => {
                        const pct = Math.round(Number(v) * 100);
                        return (
                          <li key={k} className="flex items-center gap-3 text-[14px]">
                            <span className="w-20 shrink-0 text-ink">{PART_LABEL[k]}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                            <span className="w-8 text-right font-semibold tabular-nums text-accent">{pct}</span>
                          </li>
                        );
                      })}
                      {d.bonus ? <li className="text-[13px] text-leaf">서로 다시 만나고 싶다고 한 쌍 +{d.bonus}점</li> : null}
                    </ul>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-field p-4 sm:grid-cols-3">
                    <Strip I={UsersRound} k="나이 차" v={`${d.ageGap}살`} sub={`여성 ${d.female} / 남성 ${d.male}`} />
                    <Strip I={Heart} k="공통 관심사" v={d.commonInterests.slice(0, 2).join(" · ") || "-"} />
                    <Strip I={Users} k="이전 만남" v={`${d.metPairs}쌍 / 전체 ${d.totalPairs}쌍`} sub={`희망 성향 충족 ${d.wantedMet}/${d.wantedTotal}명`} />
                  </div>
                  {reasons.length > 0 && (
                    <div className="mt-4 rounded-2xl bg-accent-soft/40 p-4">
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-accent"><Sparkles size={17} />참가자에게 안내되는 매칭 이유</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {reasons.map((r, i) => <span key={r} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${REASON_TONE[i % 3]}`}>{r}</span>)}
                      </div>
                    </div>
                  )}
                  <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                    <span>차단·비선호 충돌 없음 (확정 전 검증 통과)</span>
                    {t.confirmed_at && <span>자동 확정 {fmtDateTime(t.confirmed_at)}</span>}
                    <Link href={`/admin/tables/${t.id}`} className="font-semibold text-accent">테이블 상세 →</Link>
                  </p>
                </div>
              </article>
            );
          })}
          {run && !tables.length && <p className="shadow-card rounded-[20px] bg-card p-10 text-center text-muted">꾸려진 테이블이 없어요.</p>}
        </div>

        <aside className="shadow-card rounded-[20px] bg-card p-5 xl:sticky xl:top-6">
          <h2 className="text-[19px] font-bold text-ink">테이블에 못 든 사람 <span className="text-[15px] font-medium text-muted">· {failed.length}명</span></h2>
          <ul className="mt-4 space-y-3">
            {failed.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[17px] font-bold text-ink">{a.users.name}</p>
                    <p className="text-[13px] text-muted">{a.users.profiles?.birth_year} · {a.users.profiles?.gender === "M" ? "남" : "여"} · {a.users.profiles?.mbti ?? "-"}</p>
                  </div>
                  <Badge v={label(MATCH, a.match_status)} />
                </div>
                <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-[#4c5368]"><span className="mr-2 text-muted">사유</span>{a.match_reason ?? "-"}</p>
              </li>
            ))}
            {!failed.length && <li className="py-6 text-center text-[14px] text-muted">모두 테이블에 앉았어요.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Strip({ I, k, v, sub }: { I: LucideIcon; k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <I size={26} className="shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{k}</p>
        <p className="truncate text-[16px] font-bold text-ink">{v}</p>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}
