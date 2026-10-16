import { ChevronDown, Heart, Settings2, ShieldCheck, Sparkles, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, btnLight, btnPrimary, ctl, th } from "@/components/admin-ui";
import { MATCH, TABLE, ageBand, label } from "@/lib/labels";
import { now } from "@/lib/clock";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import type { ScoreDetail } from "@/lib/matching/types";
import { DEFAULT_SETTINGS, pairKey } from "@/lib/matching/types";
import { sidoOf } from "@/lib/regions";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PART_LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };

export default async function MatchingMonitor({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await requireAdmin();
  const { r } = await searchParams;
  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at").order("match_at");
  const round = rounds?.find((x) => x.id === r) ?? rounds?.find((x) => x.status === "matched") ?? rounds?.[0];
  if (!round)
    return (
      <div>
        <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">자동 매칭 모니터</h1>
        <div className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center">
          <p className="text-[17px] font-bold text-ink">아직 회차가 없어요</p>
          <p className="mt-1.5 text-[14px] text-muted">회차를 만들면 신청 마감 시각에 결제를 마친 사람끼리 자동으로 테이블을 꾸리고, 그 결과와 이유가 여기에 보여요.</p>
          {me.level === "full" && <Link href="/admin/rounds" className={`${btnPrimary} mt-5`}>회차 만들기</Link>}
        </div>
      </div>
    );

  const { data: run } = await db().from("match_runs").select("*").eq("round_id", round.id).maybeSingle();
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
              <span className="flex items-center gap-2 text-[15px] font-semibold text-accent">실행 요약 <Badge v={run.status === "done" ? ["완료", "leaf"] : run.status === "running" ? ["실행 중", "candle"] : ["실패", "danger"]} /></span>
              <span className="mt-0.5 block text-[14px] text-[#4c5368]">
                {fmtDateTime(run.started_at)} 시작{run.finished_at ? ` · ${fmtDateTime(run.finished_at)} 끝` : ""} · 알고리즘 {run.algorithm_version} · 대상 {run.candidate_count}명 → 확정 {st("confirmed")}명 / 테이블 {tables.length}개 / 재배치 {st("reallocated")}명 / 가까운 동네 {st("widened")}명 / 병합 {st("merged")} / 해제 {st("dissolved")} / 대안 안내 {st("failed")}명{st("exceptions") ? ` / 데이터 예외 ${st("exceptions")}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-1 border-l border-line pl-4 text-[14px] font-semibold text-accent">처리 기록 보기 <ChevronDown size={18} className="transition group-open:rotate-180" /></span>
          </summary>
          <ol className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-6 py-4 text-[13px] text-muted">{(summary.log ?? []).map((l, i) => <li key={i}>{l}</li>)}</ol>
        </details>
      )}
      {run?.status === "failed" && (
        <p className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">
          매칭 실행이 실패했어요{typeof summary.error === "string" ? `: ${summary.error}` : ""}. 같은 회차는 한 번만 돌아서 다시 돌려도 테이블이 두 번 생기지 않아요. 원인을 고친 뒤 개발 담당에게 재실행을 요청해 주세요.
        </p>
      )}
      {run?.status === "running" && <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">매칭이 아직 도는 중이에요. 보통 1분 안에 끝나요. 새로 고침해 보세요.</p>}

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {tables.map((t) => {
            const d = t.score_detail;
            const members = apps.filter((a) => a.table_id === t.id);
            const reasons = t.explanation.reasons ?? [];
            const cf = conflictsOf(members);
            const cfN = cf.block + cf.report + cf.avoid;
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
                      {typeof d?.gate === "number" && d.gate !== Number(t.score) && <p className="text-[12px] text-muted">확정 판정 {Math.round(d.gate)}점 (성비 감점 제외)</p>}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                    <table className="w-full text-[14px]">
                      <thead><tr>{["이름 · 배치 사유", "연령대", "성별", "MBTI", "희망 일정·동네", "희망 상대", "재배치"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-line">
                        {members.map((mb) => {
                          const w = wantedOf(mb, members);
                          const pickedSlot = mb.application_slots.some((x) => x.slot_id === t.slot_id);
                          return (
                          <tr key={mb.id} className="align-top">
                            <td className="px-4 py-2.5">
                              <span className="block font-medium text-ink">{mb.users.name}</span>
                              {mb.match_reason && <span className="mt-0.5 block max-w-[260px] text-[12px] leading-snug text-muted">{mb.match_reason}</span>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-[#4c5368]">{ageBand(mb.users.profiles?.birth_year, year)}</td>
                            <td className="px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.gender === "M" ? "남" : "여"}</td>
                            <td className="px-4 py-2.5 text-[#4c5368]">{mb.users.profiles?.mbti ?? "-"}</td>
                            <td className="px-4 py-2.5 text-[13px]">{pickedSlot ? <span className="text-ink2">고른 일정</span> : (mb.areas ?? []).some((x) => x === t.slots.region || x === `${sidoOf(t.slots.region)} 전체`) ? <span className="text-ink2">고른 동네</span> : <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">가까운 동네로 이동</span>}</td>
                            <td className="px-4 py-2.5 text-[13px]">{!w ? <span className="text-muted">고르지 않음</span> : w.ok ? <span className="text-ink2" title={w.want.join(", ")}>충족 {w.n}명</span> : <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn" title={w.want.join(", ")}>못 맞춤</span>}</td>
                            <td className="px-4 py-2.5 text-[13px] tabular-nums">{mb.realloc_count > 0 ? <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">{mb.realloc_count}회</span> : <span className="text-muted">0회</span>}</td>
                          </tr>
                          );
                        })}
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
                      {d.guideBonus ? <li className="text-[13px] text-leaf">즐겁게 다녀간 재참가자가 첫 참가자와 함께 앉음 +{d.guideBonus}점 <span className="text-muted">(총점에만)</span></li> : null}
                      {d.penalty ? <li className="text-[13px] text-danger">지난번 만족도가 낮았던 조합 {d.coolPairs}쌍이 다시 앉음 −{d.penalty}점 <span className="text-muted">(총점에만)</span></li> : null}
                    </ul>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-field p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Strip I={UsersRound} k="나이 차" v={`${d.ageGap}살`} sub={`${d.ageGap <= DEFAULT_SETTINGS.maxAgeGap ? `${DEFAULT_SETTINGS.maxAgeGap}살 이내 규칙 지킴` : `${DEFAULT_SETTINGS.maxAgeGap}살 규칙 넘음`} · 여성 ${d.female} / 남성 ${d.male}`} danger={d.ageGap > DEFAULT_SETTINGS.maxAgeGap} />
                    <Strip I={Heart} k="공통 관심사" v={d.commonInterests.slice(0, 2).join(" · ") || "-"} sub={`MBTI ${d.mbtiList.join(" · ")}`} />
                    <Strip I={Users} k="이전 만남" v={`${d.metPairs}쌍 / 전체 ${d.totalPairs}쌍`} sub={`희망 성향 충족 ${d.wantedMet}/${d.wantedTotal}명`} />
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
                    {cfN > 0 ? <span className="font-semibold text-danger">확정 뒤 생긴 차단·신고·비선호가 있어요. 테이블 상세의 긴급 수정에서 분리해 주세요</span> : <span>지금 기준으로 다시 세어 봐도 충돌 없음</span>}
                    {t.confirmed_at && <span>{t.explanation.origin === "admin_split" ? "운영자 분리로 확정" : "자동 확정"} {fmtDateTime(t.confirmed_at)}</span>}
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
                    <p className="text-[13px] text-muted">{ageBand(a.users.profiles?.birth_year, year)} · {a.users.profiles?.gender === "M" ? "남" : "여"} · {a.users.profiles?.mbti ?? "-"}</p>
                  </div>
                  <Badge v={label(MATCH, a.match_status)} />
                </div>
                <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-[#4c5368]"><span className="mr-2 text-muted">사유</span>{a.match_reason ?? "-"}</p>
                <p className="mt-1 text-[12px] text-muted">재배치 시도 {a.realloc_count}회{failedAt.get(a.id) ? ` · 실패 ${fmtDateTime(failedAt.get(a.id)!)}` : ""}</p>
              </li>
            ))}
            {!failed.length && <li className="py-6 text-center text-[14px] text-muted">모두 테이블에 앉았어요.</li>}
          </ul>
        </aside>
      </div>
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
