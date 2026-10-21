import { Bell, Check, ExternalLink, LogIn, Monitor, Share, Smartphone } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { isDemoHuman } from "@/lib/demo-panel";
import { fmtDateTime, withRo } from "@/lib/format";
import { roundLabel } from "@/lib/round-label";
import { TOUR_NAME, TOUR_ORDER, TOUR_PROGRESS, TOUR_TEXT, type TourStepKey } from "@/lib/tour";
import { type TourApp, tourHuman, tourSnapshot } from "@/lib/tour-state";
import { CopyLink } from "./copy-link";
import { TourRunButton } from "./run-button";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type App = TourApp;

/** 참가자 앱을 새 탭에서 그 사람으로 연다 (운영자 로그인은 그대로 남는다). 서버 액션은 새 탭을 못 열어서 GET 링크로 */
function AsUser({ a, to, children }: { a?: App; to: (a: App) => string; children: ReactNode }) {
  if (!a) return null;
  const href = `/api/demo-login?${new URLSearchParams({ login: a.users.login_id, to: to(a) }).toString()}`;
  return (
    <a href={href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 text-[14px] font-semibold text-accent-text hover:bg-accent hover:text-white">
      <Smartphone size={16} aria-hidden="true" />{children} <span className="font-normal opacity-80">· {withRo(a.users.name)}</span><ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

function AdminLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[14px] font-semibold text-ink hover:border-accent">
      <Monitor size={16} aria-hidden="true" />{children}<ExternalLink size={14} aria-hidden="true" className="text-muted" />
    </Link>
  );
}

/** 이 주소의 바깥 주소(휴대폰에서 열 링크) */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "wooyeon-table-ten.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Tour({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireAdmin();
  const { m } = await searchParams;
  const [{ t, cur, next, paid, step }, h, base] = await Promise.all([tourSnapshot(), tourHuman(), origin()]);
  const idx = TOUR_ORDER.indexOf(step);
  const apps = cur?.apps ?? [];
  const confirmed = apps.filter((a) => a.match_status === "CONFIRMED");
  const failed = apps.filter((a) => a.match_status === "ALTERNATIVE_OFFERED");
  const moved = apps.filter((a) => (a.realloc_count ?? 0) > 0);
  const tables = new Set(confirmed.map((a) => a.table_id)).size;
  const attended = apps.filter((a) => a.attendance_status === "ATTENDED").length;
  const noShow = confirmed.filter((a) => a.attendance_status !== "ATTENDED").length;
  const nConfirmed = next?.apps.filter((a) => a.match_status === "CONFIRMED") ?? [];
  const rq = cur ? `?r=${cur.id}` : "";
  const nq = next ? `?r=${next.id}` : "";

  // 휴대폰으로 로그인할 시연 참가자: 투어 회차 신청이 있으면 그 신청, 없으면 계정만
  const blank = (u: { id: string; login_id: string; name: string }): App => ({ id: "", user_id: u.id, table_id: null, match_status: "", payment_status: "", attendance_status: null, realloc_count: null, users: { login_id: u.login_id, name: u.name, is_demo: true } });
  const mine = h ? apps.find((a) => a.user_id === h.id) : undefined;
  const human = mine ?? (h ? blank(h) : undefined);
  /** 그 상태인 사람 한 명: 휴대폰 계정 → 다른 시연 사람 계정 → 테스트 참가자 순 */
  const rank = (a: App) => (a.user_id === h?.id ? 2 : isDemoHuman(a.users) ? 1 : 0);
  const pick = (list: App[], ok: (a: App) => boolean) => list.filter(ok).sort((a, b) => rank(b) - rank(a))[0];
  const okOne = pick(apps, (a) => a.match_status === "CONFIRMED" && !!a.table_id);
  const failOne = pick(apps, (a) => a.match_status === "ALTERNATIVE_OFFERED");
  const nextOk = next ? pick(next.apps, (a) => a.match_status === "CONFIRMED" && !!a.table_id) : undefined;
  const mineState = !mine ? null : mine.match_status === "CONFIRMED" ? "테이블 확정" : mine.match_status === "ALTERNATIVE_OFFERED" ? "테이블에 못 듦(다른 방법 고르기)" : mine.payment_status === "PAID" ? "결제 완료" : "신청 중";

  // 단계마다: 끝난 뒤 한 줄 결과와 확인할 곳(운영자 화면 / 참가자 앱)
  const result: Partial<Record<TourStepKey, string>> = {
    start: cur ? `${roundLabel(cur.title, cur.slots.map((s) => s.starts_at))} · 일정 ${cur.slots.length}개` : undefined,
    gather: `결제 완료 ${paid}명${mine?.payment_status === "PAID" ? ` (휴대폰으로 볼 ${mine.users.name}님 포함)` : ""}`,
    deadline: `테이블 ${tables}개 확정 · ${confirmed.length}명 자리 확정 · 재배치 ${moved.length}명 · 테이블에 못 든 사람 ${failed.length}명${mine && mineState ? ` · ${mine.users.name}님은 ${mineState}` : ""}`,
    dayBefore: "리마인드 알림과 단체방 안내 발송",
    start_meet: "단체방에 대화 주제 게시 · 체크인 열림",
    end: `체크인 ${attended}명 · 후기 남김 · 이번 회차 노쇼 후보 ${noShow}명`,
    reapply: next ? `다음 회차 신청 ${next.apps.length}명` : undefined,
    rematch: next ? `다음 회차 ${new Set(nConfirmed.map((a) => a.table_id)).size}개 테이블 확정` : undefined,
  };
  const see: Partial<Record<TourStepKey, ReactNode>> = {
    start: <><AdminLink href={`/admin/rounds${rq}`}>회차·식당 재고</AdminLink>{step === "gather" && <AsUser a={human} to={() => "/rounds"}>앱 · 일정 탭</AsUser>}</>,
    gather: <><AdminLink href={`/admin/applicants${rq}`}>신청자 목록</AdminLink><AsUser a={pick(apps, (a) => a.payment_status === "PAID")} to={() => "/"}>앱 · 홈 신청 상태</AsUser></>,
    deadline: <><AdminLink href={`/admin/matching${rq}`}>자동 매칭 모니터</AdminLink><AdminLink href="/admin/exceptions">예외 처리함</AdminLink><AsUser a={okOne} to={(a) => `/tables/${a.table_id}`}>앱 · 확정된 테이블</AsUser><AsUser a={failOne} to={(a) => `/applications/${a.id}/resolve`}>앱 · 못 든 사람 화면</AsUser></>,
    dayBefore: <><AdminLink href="/admin/messages">자동 메시지 발송 이력</AdminLink><AsUser a={okOne} to={(a) => `/tables/${a.table_id}/chat`}>앱 · 단체방</AsUser></>,
    start_meet: <><AdminLink href={`/admin/tables${rq}`}>테이블·단체방</AdminLink><AsUser a={okOne} to={(a) => `/tables/${a.table_id}/chat`}>앱 · 대화 주제</AsUser><AsUser a={okOne} to={() => "/"}>앱 · 홈 체크인</AsUser></>,
    end: <><AdminLink href="/admin/feedback">피드백·안전</AdminLink><AdminLink href={`/admin/attendance${rq}`}>참석·노쇼</AdminLink><AsUser a={okOne} to={(a) => `/tables/${a.table_id}/feedback`}>앱 · 별점 남기기</AsUser></>,
    reapply: <><AdminLink href={`/admin/applicants${nq}`}>다음 회차 신청자</AdminLink><AsUser a={next ? pick(next.apps, () => true) : undefined} to={() => "/"}>앱 · 홈 신청 상태</AsUser></>,
    rematch: <><AdminLink href={`/admin/matching${nq}`}>다음 회차 매칭 모니터</AdminLink><AsUser a={nextOk} to={(a) => `/tables/${a.table_id}`}>앱 · 새 테이블</AsUser></>,
  };

  const steps = TOUR_ORDER.filter((k): k is Exclude<TourStepKey, "done"> => k !== "done");
  const viewer = me.level === "viewer";
  const phoneUrl = `${base}/tour`;
  // 렌더마다 새로 붙는 키: 같은 단계라도 결과 메시지가 바뀌면 진행 모달을 닫는다
  const runKey = `${step}:${m ?? ""}`;

  return (
    <div className="mx-auto max-w-[880px]">
      <p className="text-[14px] font-semibold text-accent">심사위원용</p>
      <h1 className="mt-1 text-[30px] font-bold tracking-[-0.03em] text-ink">{TOUR_NAME}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink2">
        위에서부터 <b>초록 버튼 하나씩</b>만 누르면 돼요. 버튼을 누르면 실제 서비스에서 며칠에 걸쳐 일어나는 일이 바로 처리되고, 아래에 <b>어디서 확인하면 되는지</b>가 나와요.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        <li className="flex items-center gap-1.5"><Monitor size={15} aria-hidden="true" />운영자 화면은 새 탭으로 열려요</li>
        <li className="flex items-center gap-1.5"><Smartphone size={15} aria-hidden="true" />참가자 앱도 새 탭으로, 그 상태인 참가자로 바로 들어가요</li>
      </ul>

      {h && (
        <details open={idx <= 1} className="group mt-5 rounded-[20px] bg-field p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <span>
              <span className="flex items-center gap-2 text-[17px] font-bold text-ink"><Smartphone size={18} aria-hidden="true" />같은 링크를 휴대폰에서도 열어 주세요</span>
              <span className="mt-1 block text-[14px] leading-relaxed text-ink2">PC에서 버튼을 누르면 몇 초 안에 휴대폰에도 같은 단계와 결과가 떠요. 매칭 결과·하루 전 안내 알림도 그 휴대폰으로 가요.</span>
            </span>
            <span className="mt-1 shrink-0 text-[13px] font-semibold text-muted underline underline-offset-4 group-open:hidden">펼치기</span>
            <span className="mt-1 hidden shrink-0 text-[13px] font-semibold text-muted underline underline-offset-4 group-open:inline">접기</span>
          </summary>
          <div className="mt-4"><CopyLink url={phoneUrl} /></div>
          <ol className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <li className="rounded-[16px] bg-card p-4">
              <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><Share size={16} aria-hidden="true" />1. 홈 화면에 추가</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink2"><b>아이폰 Safari</b>: 아래 공유 버튼 → 홈 화면에 추가</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2"><b>안드로이드 Chrome</b>: 오른쪽 위 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가</p>
            </li>
            <li className="rounded-[16px] bg-card p-4">
              <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><LogIn size={16} aria-hidden="true" />2. 시연 참가자로 로그인</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">아이디 <code className="font-semibold text-ink">{h.login_id}</code> · 비밀번호 <code className="font-semibold text-ink">demo1234</code></p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">휴대폰 화면의 &lsquo;{h.name}님으로 들어가기&rsquo; 버튼을 눌러도 돼요. 설치한 앱을 처음 열면 한 번 더 로그인해 주세요.</p>
            </li>
            <li className="rounded-[16px] bg-card p-4">
              <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink"><Bell size={16} aria-hidden="true" />3. 알림 허용</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">따라보기 화면에서 &lsquo;알림 받기&rsquo;를 켜 주세요. 아이폰은 홈 화면에 추가한 앱에서만 알림이 와요.</p>
            </li>
          </ol>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">② 참가자 모으기에서 {h.name}님도 테스트 참가자와 같은 일정에 결제 완료로 신청돼요. 아래 &lsquo;앱&rsquo; 버튼도 되도록 이 사람으로 열려요.</p>
          <div className="mt-3"><AsUser a={human} to={() => "/tour"}>이 PC에서 따라보기 화면 열기</AsUser></div>
        </details>
      )}

      <p className="mt-4 rounded-xl bg-field px-4 py-2.5 text-[13px] text-muted">지금 시각 {fmtDateTime(t.toISOString())} · 버튼이 시연용 가상 시계를 앞으로 옮겨요. 시계는 서비스 전체가 같이 쓰므로 다른 회차의 시간 일정도 함께 처리돼요. 회원 신청·결제를 지우지는 않아요.</p>

      {m && <p role="status" className="mt-4 rounded-xl bg-leaf-soft px-4 py-3 text-[15px] font-semibold text-leaf">{m}</p>}

      <div className="mt-6 flex items-center gap-3" aria-label={`전체 ${steps.length}단계 중 ${Math.min(idx, steps.length)}단계 끝`}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-field"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(Math.min(idx, steps.length) / steps.length) * 100}%` }} /></div>
        <span className="text-[13px] font-semibold tabular-nums text-muted">{Math.min(idx, steps.length)} / {steps.length}</span>
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((k, i) => {
          const tx = TOUR_TEXT[k];
          const state = i < idx ? "done" : i === idx ? "now" : "later";
          return (
            <li key={k} id={state === "now" ? "now" : undefined} className={`scroll-mt-24 rounded-[20px] border-2 p-5 ${state === "now" ? "border-accent bg-card shadow-card" : state === "done" ? "border-transparent bg-card" : "border-transparent bg-field/60"}`}>
              <div className="flex items-start gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${state === "done" ? "bg-leaf text-white" : state === "now" ? "bg-accent text-white" : "bg-card text-muted"}`}>
                  {state === "done" ? <Check size={18} aria-label="끝" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`text-[18px] font-bold ${state === "later" ? "text-muted" : "text-ink"}`}>{tx.title}</span>
                    <span className="rounded-full bg-field px-2 py-0.5 text-[12px] font-semibold text-muted">실제 서비스에서는: {tx.who}</span>
                    {state === "now" && <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-semibold text-white">지금 할 차례</span>}
                  </p>

                  {state === "now" && (
                    <>
                      <p className="mt-2 text-[15px] leading-relaxed text-ink2">{tx.does}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <TourRunButton key={runKey} send={k} current={step} progress={TOUR_PROGRESS[k]} title={tx.title} disabled={viewer} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-accent px-6 text-[16px] font-bold text-white hover:brightness-110">{tx.button}</TourRunButton>
                        {k === "start_meet" && h && <span className="text-[13px] text-muted">누른 뒤 휴대폰 홈에서 체크인을 직접 눌러 보세요</span>}
                      </div>
                      {k === "gather" && human && (
                        <p className="mt-3 text-[13px] text-muted">직접 신청해 보고 싶으면 이 버튼을 누르기 전에: <span className="inline-block align-middle"><AsUser a={human} to={() => `/apply/${cur?.id}`}>앱에서 신청하기</AsUser></span></p>
                      )}
                      {k === "end" && mine?.match_status === "CONFIRMED" && mine.attendance_status !== "ATTENDED" && (
                        <p className="mt-3 text-[13px] text-muted">{mine.users.name}님은 아직 체크인 전이에요. 휴대폰에서 체크인해 보거나, 그냥 누르면 대신 체크인해 둬요(다음 회차에 다시 신청되도록).</p>
                      )}
                    </>
                  )}

                  {state === "done" && (
                    <>
                      {result[k] && <p className="mt-1.5 text-[15px] font-semibold text-ink">{result[k]}</p>}
                      <p className="mt-1 text-[13px] text-muted">{tx.after}</p>
                      <p className="mt-3 text-[13px] font-semibold text-ink">확인해 보세요</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">{see[k]}</div>
                    </>
                  )}

                  {state === "later" && <p className="mt-1 text-[14px] text-muted">{tx.does}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {step === "done" && (
        <div id="now" className="mt-6 rounded-[20px] bg-leaf-soft p-5">
          <p className="text-[18px] font-bold text-leaf">한 바퀴를 모두 봤어요</p>
          <p className="mt-1 text-[14px] text-ink2">신청 → 자동 매칭 → 안내 → 모임 → 후기 → 다음 매칭 반영까지 끝났어요. 처음부터 다시 보려면 아래 버튼을 누르면 새 시연 회차가 만들어져요.</p>
          <div className="mt-3">
            <TourRunButton key={runKey} send="start" current={step} progress={TOUR_PROGRESS.start} title="처음부터 다시 하기" disabled={viewer} className="inline-flex min-h-12 items-center rounded-2xl bg-leaf px-6 text-[16px] font-bold text-white">처음부터 다시 하기</TourRunButton>
          </div>
        </div>
      )}

      {idx > 0 && step !== "done" && (
        <div className="mt-8 text-center">
          <TourRunButton key={`r:${runKey}`} send="start" current={step} progress={TOUR_PROGRESS.start} title="새 시연 회차로 처음부터" disabled={viewer} className="text-[13px] text-muted underline underline-offset-4">새 시연 회차로 처음부터 다시 하기</TourRunButton>
        </div>
      )}
    </div>
  );
}
