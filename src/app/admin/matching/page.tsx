import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
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
    .select("id,status,score,score_detail,explanation,confirmed_at,reservation_name,slots(region,starts_at),venues(name),chat_rooms(id)")
    .eq("round_id", round.id)
    .order("created_at");
  const tables = (tablesRaw ?? []) as unknown as {
    id: string; status: string; score: number; score_detail: ScoreDetail; explanation: { reasons?: string[]; origin?: string };
    confirmed_at: string; reservation_name: string | null; slots: { region: string; starts_at: string }; venues: { name: string } | null; chat_rooms: { id: string }[] | { id: string } | null;
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[24px] font-bold">자동 매칭 모니터</h1>
        <form className="flex gap-2">
          <select name="r" defaultValue={round.id} className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">
            {rounds?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
          <button className="rounded-lg border border-line bg-card px-3 py-2 text-[14px]">보기</button>
        </form>
      </div>

      {!run ? (
        <p className="mt-6 rounded-xl border border-line bg-card p-6 text-center text-muted">
          아직 매칭 전이에요. {fmtDateTime(round.match_at)}에 자동으로 실행돼요.
        </p>
      ) : (
        <section className="mt-6 grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-line bg-card p-5">
            <p className="text-[13px] text-muted">실행 {fmtDateTime(run.started_at)} · 알고리즘 {run.algorithm_version} · 대상 {run.candidate_count}명</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              {[
                ["확정", summary.confirmed], ["테이블", tables.length], ["일정 분리", summary.splitSlots], ["해제", summary.dissolved],
                ["재배치", summary.reallocated], ["병합", summary.merged], ["대안 안내", summary.failed], ["데이터 예외", summary.exceptions],
              ].map(([k, v]) => (
                <span key={String(k)} className="rounded-full bg-line/50 px-3 py-1">{String(k)} <b>{String(v ?? 0)}</b></span>
              ))}
            </div>
          </div>
          <details className="rounded-2xl border border-line bg-card p-5 text-[13px]">
            <summary className="cursor-pointer font-semibold">처리 기록 보기</summary>
            <ol className="mt-3 space-y-1 text-muted">{(summary.log ?? []).map((l, i) => <li key={i}>{l}</li>)}</ol>
          </details>
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {tables.map((t, i) => {
          const d = t.score_detail;
          const members = apps.filter((a) => a.table_id === t.id);
          return (
            <article key={t.id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] text-muted">테이블 {i + 1} · {fmtDate(t.slots.starts_at)} {fmtTime(t.slots.starts_at)} {t.slots.region}</p>
                  <p className="mt-1 text-[16px] font-semibold">{t.venues?.name ?? "식당 미배정"} {t.reservation_name && <span className="text-[13px] font-normal text-muted">· {t.reservation_name}</span>}</p>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-bold">{t.score}<span className="text-[13px] font-normal text-muted">점</span></p>
                  <p className="text-[12px] text-muted">{t.status}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted">인원</dt><dd>{members.length}명</dd>
                <dt className="text-muted">나이</dt><dd>{d.oldestBirthYear}~{d.youngestBirthYear}년생 (차이 {d.ageGap}살)</dd>
                <dt className="text-muted">성비</dt><dd>남 {d.male} · 여 {d.female}</dd>
                <dt className="text-muted">MBTI</dt><dd>{d.mbtiList.join(" ")}</dd>
                <dt className="text-muted">공통 관심사</dt><dd>{d.commonInterests.join(", ") || "-"}</dd>
                <dt className="text-muted">희망 성향 충족</dt><dd>{d.wantedMet}/{d.wantedTotal}명</dd>
                <dt className="text-muted">이전 만남</dt><dd>{d.metPairs}쌍 / {d.totalPairs}쌍</dd>
                <dt className="text-muted">차단·비선호 충돌</dt><dd>없음 (확정 전 검증 통과)</dd>
                <dt className="text-muted">확정</dt><dd>{fmtDateTime(t.confirmed_at)} 자동</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(d.parts).map(([k, v]) => (
                  <span key={k} className="rounded bg-line/50 px-2 py-0.5 text-[12px]">{PART_LABEL[k]} {Math.round(Number(v) * 100)}</span>
                ))}
                {d.bonus ? <span className="rounded bg-leaf/10 px-2 py-0.5 text-[12px] text-leaf">재만남 희망 +{d.bonus}</span> : null}
              </div>
              <p className="mt-3 text-[13px] text-muted">참가자에게 보여준 이유: {(t.explanation.reasons ?? []).join(" · ")}</p>
              <ul className="mt-3 divide-y divide-line border-t border-line text-[13px]">
                {members.map((mb) => (
                  <li key={mb.id} className="flex justify-between py-1.5">
                    <span>{mb.users.name} <span className="text-muted">{mb.users.profiles?.birth_year} {mb.users.profiles?.gender === "M" ? "남" : "여"} {mb.users.profiles?.mbti ?? ""}</span></span>
                    {mb.realloc_count > 0 && <span className="text-accent">재배치 {mb.realloc_count}회</span>}
                  </li>
                ))}
              </ul>
              <Link href={`/tables/${t.id}`} className="mt-3 inline-block text-[13px] underline underline-offset-4">단체방 보기</Link>
            </article>
          );
        })}
      </div>

      {failed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold">테이블에 앉지 못한 사람</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-[14px]">
            {failed.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 px-4 py-3">
                <span>{a.users.name} <span className="text-muted">{a.users.profiles?.birth_year}년생</span></span>
                <span className="text-right text-muted">{a.match_reason} · <b>{a.match_status}</b></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
