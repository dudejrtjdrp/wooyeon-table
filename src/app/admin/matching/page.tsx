import { ChevronDown, Heart, Search, Settings2, ShieldCheck, Sparkles, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, Term, btnLight, btnPrimary, ctl, th } from "@/components/admin-ui";
import { TIP, humanizeMatchLog } from "@/lib/admin-glossary";
import { MATCH, TABLE, ageBand, label } from "@/lib/labels";
import { now } from "@/lib/clock";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import type { ScoreDetail } from "@/lib/matching/types";
import { DEFAULT_SETTINGS, pairKey } from "@/lib/matching/types";
import { sidoOf } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { roundsAndCurrent } from "@/lib/admin-data";
import { hits, tableHits } from "@/lib/match-search";
import { matchNowCheck } from "@/lib/admin-manual";
import { ConfirmButton } from "../confirm-button";
import { runNowAction } from "./actions";
import { ExpandAll } from "./expand-all";

export const dynamic = "force-dynamic";

const PART_LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };

export default async function MatchingMonitor({ searchParams }: { searchParams: Promise<{ r?: string; q?: string }> }) {
  const me = await requireAdmin();
  const { r, q: q0 } = await searchParams;
  const q = (q0 ?? "").trim().slice(0, 40);
  const { rounds } = await roundsAndCurrent(r);
  const round = rounds.find((x) => x.id === r) ?? rounds.find((x) => x.status === "matched") ?? rounds[0];
  if (!round)
    return (
      <div>
        <PageHeader title="자동 매칭 모니터" desc="신청 마감 시각에 자동으로 꾸린 테이블과 그 이유를 봐요." />
        <div className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center">
          <p className="text-[17px] font-bold text-ink">아직 회차가 없어요</p>
          <p className="mt-1.5 text-[14px] text-muted">회차를 만들면 신청 마감 시각에 결제를 마친 사람끼리 자동으로 테이블을 꾸리고, 그 결과와 이유가 여기에 보여요.</p>
          {me.level === "full" && <Link href="/admin/rounds?tab=new" className={`${btnPrimary} mt-5`}>회차 만들기</Link>}
        </div>
      </div>
    );

  const { data: run } = await db().from("match_runs").select("*").eq("round_id", round.id).maybeSingle();
  // 매칭 시각 전 '지금 돌리기' (lib/admin-manual-rules.ts canRunMatchNow): 이미 돌았거나 닫힌 회차는 막고, 신청 마감 전이면 확인 문구에 먼저 알린다
  const runNow = !run ? (await matchNowCheck(round.id)).check : null;
  // 생년 대신 연령대만 보여 준다(개인정보는 필요한 화면에서만). 8살 규칙 확인은 테이블 나이 차로 충분하다
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(await now()));
  const { data: tablesRaw } = await db()
    .from("dining_tables")
    .select("id,status,slot_id,score,score_detail,explanation,confirmed_at,reservation_name,slots(region,starts_at),venues(name,address),chat_rooms(id)")
    .eq("round_id", round.id)
    .order("created_at");
  const tables = (tablesRaw ?? []) as unknown as {
    id: string; status: string; slot_id: string; score: number; score_detail: ScoreDetail; explanation: { reasons?: string[]; origin?: string };
    confirmed_at: string; reservation_name: string | null; slots: { region: string; starts_at: string }; venues: { name: string; address: string } | null; chat_rooms: { id: string }[] | { id: string } | null;
  }[];
  const { data: appsRaw } = await db()
    .from("applications")
    .select("id,user_id,table_id,match_status,realloc_count,match_reason,areas,near_ok,application_slots(slot_id),users(name,profiles(birth_year,gender,mbti,my_traits,wanted_traits))")
    .eq("round_id", round.id);
  const apps = (appsRaw ?? []) as unknown as {
    id: string; user_id: string; table_id: string | null; match_status: string; realloc_count: number; match_reason: string | null; areas: string[] | null; near_ok: boolean | null;
    application_slots: { slot_id: string }[];
    users: { name: string; profiles: { birth_year: number; gender: string; mbti: string | null; my_traits: string[] | null; wanted_traits: string[] | null } | null };
  }[];
  // 7.2 차단·비선호 충돌: 테이블마다 실제로 센다 (확정 전 검증을 통과했어도, 확정 뒤 새로 생긴 차단·신고가 있을 수 있다)
  const uids = [...new Set(apps.map((a) => a.user_id))];
  const [{ data: blocks }, { data: reps }, { data: avoids }, { data: failEv }] = uids.length
    ? await Promise.all([
        db().from("blocks").select("blocker_id,blocked_id").in("blocker_id", uids),
        db().from("safety_reports").select("reporter_id,reported_id").in("reporter_id", uids),
        db().from("person_prefs").select("from_user,to_user").eq("pref", "avoid").in("from_user", uids),
        db().from("status_events").select("entity_id,created_at").eq("entity_type", "application").eq("field", "match_status").eq("to_value", "ALTERNATIVE_OFFERED").in("entity_id", apps.map((a) => a.id)).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const rel = { block: new Set((blocks ?? []).map((b) => pairKey(b.blocker_id, b.blocked_id))), report: new Set((reps ?? []).map((b) => pairKey(b.reporter_id, b.reported_id))), avoid: new Set((avoids ?? []).map((b) => pairKey(b.from_user, b.to_user))) };
  const conflictsOf = (ms: typeof apps) => {
    const c = { block: 0, report: 0, avoid: 0 };
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) {
        const k = pairKey(ms[i].user_id, ms[j].user_id);
        if (rel.block.has(k)) c.block++;
        if (rel.report.has(k)) c.report++;
        if (rel.avoid.has(k)) c.avoid++;
      }
    return c;
  };
  const failedAt = new Map<string, string>();
  for (const e of failEv ?? []) failedAt.set(e.entity_id, e.created_at);
  // 참가자별 희망 상대 충족: 내가 원한 성향을 가진 사람이 같은 테이블에 있는지
  const wantedOf = (m: (typeof apps)[number], ms: typeof apps) => {
    const want = m.users.profiles?.wanted_traits ?? [];
    if (!want.length) return null;
    const hits = ms.filter((o) => o.id !== m.id && (o.users.profiles?.my_traits ?? []).some((x) => want.includes(x)));
    return { ok: hits.length > 0, n: hits.length, want };
  };
  const failed = apps.filter((a) => ["ALTERNATIVE_OFFERED", "EXCEPTION", "TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.table_id);
  const summary = (run?.summary ?? {}) as Record<string, unknown> & { log?: string[] };

  const st = (k: string) => Number((summary as Record<string, unknown>)[k] ?? 0);
  const REASON_TONE = ["bg-accent-soft text-accent", "bg-leaf/10 text-leaf", "bg-[#f0ecfd] text-[#6a4fd6]"];
  // 검색: 걸린 테이블은 펼쳐서 보여 준다
  const foundN = q ? tables.filter((t) => tableHits(q, { names: apps.filter((a) => a.table_id === t.id).map((a) => a.users.name), reservationName: t.reservation_name, venueName: t.venues?.name ?? null, region: t.slots.region })).length : 0;
  const failedHit = q ? failed.filter((a) => hits(q, a.users.name)).length : 0;

  return (
    <div>
      <PageHeader
        title="자동 매칭 모니터"
        desc={<>신청 마감 시각에 결제한 사람끼리 자동으로 꾸린 테이블과 그 이유예요. 모자란 테이블은 자동 <Term tip={TIP.재배치}>재배치</Term>까지 해 본 뒤 결과가 여기 남아요.</>}
        how={[<>위에서 <Term tip={TIP.회차}>회차</Term> 고르기</>, "실행 요약에서 확정·재배치·실패 수 보기", <>테이블마다 <Term tip={TIP.매칭점수}>매칭 점수</Term>와 충돌 확인</>, "'테이블에 못 든 사람'에서 사유 보기", "문의가 오면 이름·예약명·식당으로 검색"]}
        actions={
          <form className="flex min-w-0 max-w-full flex-wrap gap-2">
            <select name="r" defaultValue={round.id} className={`${ctl} min-w-0 max-w-full`} aria-label="회차">
              {rounds.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <button className={btnLight}>보기</button>
          </form>
        }
      />

      {!run ? (
        <div className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center">
          <p className="text-muted">
            {round.status === "closed" ? "닫힌 회차라 매칭이 돌지 않아요." : `아직 매칭 전이에요. ${fmtDateTime(round.match_at)}에 자동으로 실행돼요.`}
          </p>
          {runNow && round.status !== "closed" && me.level === "full" && (
            runNow.ok ? (
              <form action={runNowAction} className="mt-5">
                <input type="hidden" name="r" value={round.id} />
                <ConfirmButton confirm={runNow.confirm} className={btnPrimary}>지금 매칭 돌리기</ConfirmButton>
                <p className="mt-2 text-[13px] text-muted">{runNow.early ? "아직 신청 마감 전이에요. 지금 돌리면 마감 전 신청자만 들어가요." : "실행 시각을 기다리지 않고 바로 돌려요."} 같은 회차는 한 번만 돌아요.</p>
              </form>
            ) : <p className="mt-3 text-[13px] text-muted">지금 돌릴 수 없어요: {runNow.reason}</p>
          )}
        </div>
      ) : (
        <details className="shadow-card group mt-6 rounded-[20px] bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Settings2 size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-accent">실행 요약 <Badge v={run.status === "done" ? ["완료", "leaf"] : run.status === "running" ? ["실행 중", "candle"] : ["실패", "danger"]} /></span>
              <span className="mt-0.5 block text-[14px] text-[#4c5368]">
                {fmtDateTime(run.started_at)} 시작{run.finished_at ? ` · ${fmtDateTime(run.finished_at)} 끝` : ""} · <Term tip={TIP.매칭규칙버전}>매칭 규칙 버전</Term> {run.algorithm_version}
                <span className="mt-0.5 block">대상 {run.candidate_count}명 → 확정 {st("confirmed")}명(테이블 {tables.length}개) · 재배치 {st("reallocated")}명 · 가까운 동네로 {st("widened")}명 · 테이블 병합 {st("merged")}번 · 해제 {st("dissolved")}번 · 실패 안내 {st("failed")}명{st("exceptions") ? ` · 정보 누락 ${st("exceptions")}건` : ""}</span>
              </span>
            </span>
            <span className="flex items-center gap-1 border-l border-line pl-4 text-[14px] font-semibold text-accent">처리 기록 보기 <ChevronDown size={18} className="transition group-open:rotate-180" /></span>
          </summary>
          <ol className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-6 py-4 text-[13px] text-muted">{(summary.log ?? []).map((l, i) => <li key={i}>{humanizeMatchLog(l)}</li>)}</ol>
        </details>
      )}
      {run?.status === "failed" && (
        <p className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">
          매칭 실행이 실패했어요{typeof summary.error === "string" ? `: ${summary.error}` : ""}. 같은 회차는 한 번만 돌아서 다시 돌려도 테이블이 두 번 생기지 않아요. 원인을 고친 뒤 개발 담당에게 재실행을 요청해 주세요.
        </p>
      )}
      {run?.status === "running" && <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">매칭이 아직 도는 중이에요. 보통 1분 안에 끝나요. 새로 고침해 보세요.</p>}

      {/* 못 든 사람: 고정(sticky)·안쪽 스크롤 없이 페이지와 함께 흐른다 */}
      <section className="shadow-card mt-6 rounded-[20px] bg-card p-5" aria-labelledby="failed-title">
        <h2 id="failed-title" className="text-[19px] font-bold text-ink">테이블에 못 든 사람 <span className="text-[15px] font-medium text-muted">· {failed.length}명</span></h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {failed.map((a) => (
            <li key={a.id} className={`min-w-0 rounded-2xl border p-4 ${hits(q, a.users.name) ? "border-accent ring-2 ring-accent/30" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[17px] font-bold text-ink">{a.users.name}</p>
                  <p className="text-[13px] text-muted">{ageBand(a.users.profiles?.birth_year, year)} · {a.users.profiles?.gender === "M" ? "남" : "여"} · {a.users.profiles?.mbti ?? "-"}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap"><Badge v={label(MATCH, a.match_status)} /></span>
              </div>
              <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-[#4c5368]"><span className="mr-2 text-muted">사유</span>{a.match_reason ?? "-"}</p>
              <p className="mt-1 text-[12px] text-muted">재배치 시도 {a.realloc_count}번{failedAt.get(a.id) ? ` · 실패 ${fmtDateTime(failedAt.get(a.id)!)}` : ""}</p>
            </li>
          ))}
          {!failed.length && <li className="py-6 text-center text-[14px] text-muted sm:col-span-2 xl:col-span-3">모두 테이블에 앉았어요.</li>}
        </ul>
      </section>

      {/* 테이블 목록: 접어서 한 줄로 보고, 문의가 오면 검색해서 펼친다 */}
      <section className="mt-8" aria-labelledby="tables-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tables-title" className="text-[20px] font-bold tracking-[-0.02em] text-ink">꾸려진 테이블 <span className="text-[15px] font-medium text-muted">· {tables.length}개</span></h2>
          {tables.length > 0 && <ExpandAll />}
        </div>
        <form className="mt-3 flex flex-wrap items-center gap-2" role="search" aria-label="테이블 검색">
          <input type="hidden" name="r" value={round.id} />
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">이름·예약명·식당으로 찾기</span>
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input name="q" type="search" defaultValue={q} maxLength={40} placeholder="참가자 이름, 예약명, 식당 이름" className={`${ctl} w-full pl-10`} />
          </label>
          <button className={btnLight}>찾기</button>
          {q && <Link href={`/admin/matching?r=${round.id}`} className="whitespace-nowrap px-2 text-[13px] font-semibold text-muted hover:text-ink">검색 지우기</Link>}
        </form>
        {q && (
          <p className="mt-2 text-[13px] text-muted" aria-live="polite">
            &lsquo;{q}&rsquo; {foundN ? <>테이블 <b className="text-ink">{foundN}개</b>를 찾아 펼쳤어요</> : "에 맞는 테이블이 없어요"}{failedHit ? ` · 못 든 사람 중 ${failedHit}명` : ""}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {tables.map((t) => {
            const d = t.score_detail;
            const members = apps.filter((a) => a.table_id === t.id);
            const reasons = t.explanation.reasons ?? [];
            const cf = conflictsOf(members);
            const cfN = cf.block + cf.report + cf.avoid;
            const open = tableHits(q, { names: members.map((m) => m.users.name), reservationName: t.reservation_name, venueName: t.venues?.name ?? null, region: t.slots.region });
            return (
              <details key={t.id} data-mt open={open} className={`shadow-card group min-w-0 rounded-[20px] bg-card ${open ? "ring-2 ring-accent/30" : ""}`}>
                <summary className="flex cursor-pointer list-none items-start gap-3 rounded-[20px] p-4 hover:bg-accent-soft/20 focus-visible:outline-2 focus-visible:outline-accent sm:p-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[17px] font-bold text-ink">{t.slots.region} · {t.venues?.name ?? "식당 미배정"}</span>
                      <span className="whitespace-nowrap text-[13px] text-muted">{fmtDay(t.slots.starts_at)} {fmtTime(t.slots.starts_at)}</span>
                      <span className="whitespace-nowrap"><Badge v={label(TABLE, t.status)} /></span>
                      {cfN > 0 && <span className="whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-[12px] font-semibold text-danger">충돌 {cfN}쌍</span>}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#4c5368]">
                      <span className="whitespace-nowrap font-semibold text-ink">{members.length}명</span>
                      <span className="whitespace-nowrap font-semibold text-accent">매칭 {Math.round(Number(t.score))}점</span>
                      {t.reservation_name && <span className="whitespace-nowrap">예약명 <b className="font-semibold text-ink">{t.reservation_name}</b></span>}
                      <span className="min-w-0 break-keep">{t.venues?.address ?? "주소 없음"}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5" aria-label="참가자">
                      {members.map((m) => (
                        <span key={m.id} className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${hits(q, m.users.name) ? "bg-accent text-white" : "bg-field text-ink"}`}>{m.users.name}</span>
                      ))}
                    </span>
                  </span>
                  <ChevronDown size={20} aria-hidden="true" className="mt-1 shrink-0 text-muted transition group-open:rotate-180" />
                </summary>

                <div className="border-t border-line p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[19px] font-bold text-ink">{t.venues?.name ?? "식당 미배정"} · {members.length}명</p>
                      <p className="mt-1 text-[14px] text-muted">{t.venues?.address ?? "예외 처리함에서 식당을 다시 배정할 수 있어요"}{t.reservation_name ? ` · 예약명 ${t.reservation_name}` : ""}</p>
                    </div>
                    <div className="rounded-2xl bg-accent-soft/60 px-5 py-3 text-right">
                      <p className="text-[12px] text-muted"><Term tip={TIP.매칭점수}>매칭 점수</Term></p>
                      <p className="text-[30px] font-bold leading-tight text-accent">{Math.round(Number(t.score))}<span className="text-[16px] font-semibold">점</span></p>
                      {typeof d?.gate === "number" && d.gate !== Number(t.score) && <p className="text-[12px] text-muted">확정 판정 {Math.round(d.gate)}점 (성비 감점 제외)</p>}
                    </div>
                  </div>
                  {/* 표가 넓으면 이 상자 안에서만 가로로 밀린다 */}
                  <div className="mt-5 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[820px] text-[14px]">
                      <thead><tr>{["이름 · 배치 사유", "연령대", "성별", "MBTI", "희망 일정·동네", "희망 상대", "재배치"].map((h) => <th key={h} className={`${th} whitespace-nowrap first:rounded-none last:rounded-none`}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-line">
                        {members.map((mb) => {
                          const w = wantedOf(mb, members);
                          const pickedSlot = mb.application_slots.some((x) => x.slot_id === t.slot_id);
                          return (
                          <tr key={mb.id} className="align-top">
                            <td className="w-[340px] min-w-[260px] px-4 py-2.5">
                              <span className="block font-medium text-ink">{mb.users.name}</span>
                              {mb.match_reason && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{mb.match_reason}</span>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[#4c5368]">{ageBand(mb.users.profiles?.birth_year, year)}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.gender === "M" ? "남" : "여"}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.mbti ?? "-"}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">{pickedSlot ? <span className="text-ink2">고른 일정</span> : (mb.areas ?? []).some((x) => x === t.slots.region || x === `${sidoOf(t.slots.region)} 전체`) ? <span className="text-ink2">고른 동네</span> : <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">가까운 동네로 이동</span>}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">{!w ? <span className="text-muted">고르지 않음</span> : w.ok ? <span className="text-ink2" title={w.want.join(", ")}>충족 {w.n}명</span> : <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn" title={w.want.join(", ")}>못 맞춤</span>}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[13px] tabular-nums">{mb.realloc_count > 0 ? <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">{mb.realloc_count}회</span> : <span className="text-muted">0회</span>}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted lg:hidden">표는 옆으로 밀어서 나머지 칸을 볼 수 있어요.</p>
                  <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {Object.entries(d.parts).map(([k, v]) => {
                      const pct = Math.round(Number(v) * 100);
                      return (
                        <li key={k} className="flex items-center gap-3 text-[14px]">
                          <span className="w-20 shrink-0 whitespace-nowrap text-ink">{PART_LABEL[k]}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                          <span className="w-8 text-right font-semibold tabular-nums text-accent">{pct}</span>
                        </li>
                      );
                    })}
                    {d.bonus ? <li className="text-[13px] text-leaf sm:col-span-2">서로 다시 만나고 싶다고 한 쌍 +{d.bonus}점</li> : null}
                    {d.guideBonus ? <li className="text-[13px] text-leaf sm:col-span-2">즐겁게 다녀간 재참가자가 첫 참가자와 함께 앉음 +{d.guideBonus}점 <span className="text-muted">(총점에만)</span></li> : null}
                    {d.penalty ? <li className="text-[13px] text-danger sm:col-span-2">지난번 만족도가 낮았던 조합 {d.coolPairs}쌍이 다시 앉음 −{d.penalty}점 <span className="text-muted">(총점에만)</span></li> : null}
                  </ul>
                  <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-field p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Strip I={UsersRound} k="나이 차" v={`${d.ageGap}살`} sub={`${d.ageGap <= DEFAULT_SETTINGS.maxAgeGap ? `${DEFAULT_SETTINGS.maxAgeGap}살 이내 규칙 지킴` : `${DEFAULT_SETTINGS.maxAgeGap}살 규칙 넘음`} · 여성 ${d.female}명, 남성 ${d.male}명`} danger={d.ageGap > DEFAULT_SETTINGS.maxAgeGap} />
                    <Strip I={Heart} k="공통 관심사" v={d.commonInterests.slice(0, 2).join(" · ") || "-"} sub={`MBTI ${d.mbtiList.join(" · ")}`} />
                    <Strip I={Users} k="이전 만남" v={`${d.totalPairs}쌍 중 ${d.metPairs}쌍`} sub={`희망 성향 맞춘 사람 ${d.wantedTotal}명 중 ${d.wantedMet}명`} />
                    <Strip I={ShieldCheck} k="차단·비선호 충돌" v={cfN ? `${cfN}쌍 있음` : "없음"} sub={`차단 ${cf.block} · 신고 ${cf.report} · 비선호 ${cf.avoid}쌍`} danger={cfN > 0} />
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
                    {cfN > 0 ? <span className="font-semibold text-danger">확정 뒤 생긴 차단·신고·비선호가 있어요. 테이블 상세의 <Term tip={TIP.긴급수정}>긴급 수정</Term>에서 분리해 주세요</span> : <span>지금 기준으로 다시 세어 봐도 충돌 없음</span>}
                    {t.confirmed_at && <span>{t.explanation.origin === "admin_split" ? "운영자 분리로 확정" : "자동 확정"} {fmtDateTime(t.confirmed_at)}</span>}
                    <Link href={`/admin/tables/${t.id}`} className="font-semibold text-accent">테이블 상세 →</Link>
                  </p>
                </div>
              </details>
            );
          })}
          {run && !tables.length && <p className="shadow-card rounded-[20px] bg-card p-10 text-center text-muted">꾸려진 테이블이 없어요.</p>}
        </div>
      </section>
    </div>
  );
}

function Strip({ I, k, v, sub, danger }: { I: LucideIcon; k: string; v: string; sub?: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <I size={26} className={`shrink-0 ${danger ? "text-danger" : "text-accent"}`} />
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{k}</p>
        <p className={`truncate text-[16px] font-bold ${danger ? "text-danger" : "text-ink"}`}>{v}</p>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}
