import { RoundTable } from "@/components/brand";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSheet, ErrorText, List, Pill, Row, Screen, SectionTitle } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtSlot } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";
import { cancelRule, wasReallocatedTo } from "@/lib/attendance";
import { afterMeetingNote, canClaimAttended } from "@/lib/attendance-rules";
import { REFUND_POLICY, isMembership, won } from "@/lib/constants";
import { Toast } from "@/components/ui";
import { OfferBanner } from "@/components/offer-banner";
import { cancelApplication, cancelAttendanceAction, declineReallocationAction } from "./actions";
import { after } from "next/server";
import { maybeTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

type Slot = { id: string; region: string; starts_at: string };

export default async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireProfile();
  // 예약 실행(GitHub Actions)이 몇 시간씩 밀릴 때가 있어, 모임 화면을 열 때도 밀린 일(시작 콘텐츠·체크인 안내·리마인드)을 돌린다
  after(() => maybeTick().catch(() => null));
  const { id } = await params;
  const { e, m } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select(
      "id,user_id,application_status,payment_status,match_status,attendance_status,resolution,match_reason,realloc_count,table_id,submitted_at,payments(paid_at,amount,pass_type),dining_tables(slots(starts_at,ends_at))," +
        "rounds(id,title,match_at,apply_deadline),application_slots(slots(id,region,starts_at))",
    )
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; application_status: string; payment_status: string; match_status: string;
    attendance_status: string | null; resolution: string | null; match_reason: string | null; realloc_count: number; table_id: string | null; submitted_at: string | null;
    payments: { paid_at: string | null; amount: number; pass_type: string } | null;
    dining_tables: { slots: { starts_at: string; ends_at: string } } | null;
    rounds: { id: string; title: string; match_at: string; apply_deadline: string };
    application_slots: { slots: Slot }[];
  } | null;
  if (!app || app.user_id !== me.id) redirect(`/?m=${encodeURIComponent("이 신청을 찾지 못했어요. 내 신청은 일정 탭에서 볼 수 있어요")}`);

  const t = await now();
  const h0 = headline(app, t);
  // 끝난 모임(시작 3시간 뒤)인데 아직 참석 예정이면 단체방 탭·테이블 화면과 같은 이름 '지난 모임'으로
  const endedAt = app.dining_tables ? new Date(app.dining_tables.slots.starts_at).getTime() + 3 * 3600_000 : null;
  const ended = app.match_status === "CONFIRMED" && app.attendance_status === "SCHEDULED" && endedAt !== null && endedAt <= t.getTime();
  // 체크인 없이 끝난 모임: 알릴 수 있는 기한·이미 알렸는지에 따라 할 수 있는 일만 안내 (모임 정보·후기 화면과 같은 문장)
  const claimed = ended ? Boolean((await db().from("status_events").select("id").eq("entity_id", app.id).eq("field", "attendance_claim").limit(1)).data?.length) : false;
  const afterNote = ended ? afterMeetingNote({ attended: false, canClaim: canClaimAttended(app.attendance_status, new Date(app.dining_tables!.slots.ends_at), t), claimed }) : null;
  const h = ended && afterNote
    ? { ...h0, label: "지난 모임", tone: "muted" as const, desc: afterNote.text }
    : h0;
  const slots = app.application_slots.map((x) => x.slots).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const paid = !["PENDING", "FAILED"].includes(app.payment_status);
  const matched = app.match_status === "CONFIRMED";

  const matchDone = !["WAITING", "MATCHING", "REALLOCATING"].includes(app.match_status) && paid;
  const steps = [
    { label: "신청", done: true, when: app.submitted_at ? fmtSlot(app.submitted_at) : "", note: "신청이 완료됐어요." },
    { label: "결제", done: paid, when: app.payments?.paid_at ? fmtSlot(app.payments.paid_at) : "", note: paid ? "결제가 완료됐어요." : new Date(app.rounds.match_at) <= t ? "결제 전에 마감됐어요. 빠져나간 돈은 없어요." : "결제를 마쳐야 매칭에 들어가요." },
    { label: `자동 매칭 · ${fmtSlot(app.rounds.match_at)}`, done: matchDone, when: "", note: matchDone ? "신청 인원을 모아 테이블을 꾸렸어요." : "신청 인원을 모아 테이블을 꾸려요." },
    { label: "테이블 확정 · 안내", done: matched, when: "", note: matched ? "식당과 함께 앉을 분들을 알려 드렸어요." : "테이블이 정해지면 식당과 함께 앉을 분들을 알려 드려요." },
    { label: "모임", done: app.attendance_status === "ATTENDED" || ended, when: "", note: app.attendance_status === "ATTENDED" ? "함께 저녁을 먹었어요." : ended ? "모임이 끝났어요." : "정해진 식당에서 저녁을 함께 먹어요." },
  ];
  // 매칭 실패면 '테이블 확정' 단계가 아직 올 것처럼 보이지 않게, 그 자리에서 실패와 다음 할 일을 말한다
  if (app.match_status === "ALTERNATIVE_OFFERED") {
    steps[3] = app.resolution === "wait"
      ? { label: "자리 기다리는 중", done: false, when: "", note: "고른 일정에 자리가 나면 먼저 여쭤볼게요." }
      : { label: "매칭 실패 · 다음 방법 고르기", done: false, when: "", note: "다른 일정으로 옮기거나 보관·환불을 골라 주세요." };
  }
  // 취소된 신청은 진행 단계를 이어 보여 주지 않는다: 마친 단계까지 두고 '취소됨'으로 끝낸다
  const canceledApp = app.application_status === "CANCELED" || !!app.attendance_status?.startsWith("CANCELED");
  if (canceledApp) {
    const upto = steps.findIndex((x) => !x.done);
    steps.splice(upto === -1 ? steps.length : upto, steps.length, { label: "취소됨", done: true, when: "", note: "이 신청은 여기서 마무리됐어요." });
  }
  const current = steps.findIndex((x) => !x.done);
  // 인원이 줄어 자동으로 다른 테이블로 옮겨진 사람은 거절하고 다른 방법을 고를 수 있다 (PRD: 이동·환불은 참가자 선택)
  const moved = matched && app.attendance_status === "SCHEDULED" && app.table_id ? await wasReallocatedTo(app.id, app.table_id) : false;
  // 매칭을 기다리는 동안에는 참가자가 할 일이 없으므로 주 버튼을 두지 않는다 (같은 화면으로 내려가는 버튼은 할 일이 아님)
  const unpaid = app.payment_status === "PENDING" || app.payment_status === "FAILED";
  const payClosed = unpaid && new Date(app.rounds.match_at) <= t;
  const cta: [string, string] | null = payClosed
    ? ["모집 중인 일정 보기", "/rounds"]
    : unpaid
    ? ["결제 이어서 하기", `/pay/${app.id}`]
    : matched && app.table_id
      ? ["모임 정보 보기", `/tables/${app.table_id}`]
      : app.match_status === "ALTERNATIVE_OFFERED"
        ? [app.resolution === "wait" ? "다른 방법으로 바꾸기" : "다음 방법 고르기", `/applications/${app.id}/resolve`]
        : null;
  // 취소·환불 뒤 돈이 어떻게 됐는지 한 줄로 (알림은 짧게, 결과는 여기서 본다)
  const pay = app.payments;
  const money = (() => {
    const ps = app.payment_status;
    if (app.application_status === "CANCELED" && ["PENDING", "FAILED"].includes(ps)) return "결제 전이라 빠져나간 돈은 없어요";
    if (!pay) return null;
    const used = pay.amount === 0 || pay.pass_type === "subscription";
    if (ps === "REFUNDED") return isMembership(pay.pass_type) ? "멤버십 · 횟수 차감 없이 취소됐어요" : used ? "쓴 이용권 1회를 돌려드렸어요" : `${won(pay.amount)} 환불 완료`;
    if (ps === "REFUND_REQUESTED" || ps === "REFUND_PROCESSING") return `${won(pay.amount)} 환불 처리 중`;
    if (ps === "REFUND_FAILED") return `${won(pay.amount)} 환불 다시 처리 중 · 따로 하실 일은 없어요`;
    return null;
  })();
  const idle = !cta && paid && ["WAITING", "MATCHING", "REALLOCATING"].includes(app.match_status);

  return (
    <Screen title="내 신청" back="/rounds">
      <Toast msg={m} />
      <section className="animate-rise relative mt-3 overflow-hidden rounded-[20px] bg-card">
        <div className="pointer-events-none absolute right-4 top-6">
          <RoundTable size={104} me={!canceledApp} filled={canceledApp ? 0 : matched ? 6 : app.match_status === "ALTERNATIVE_OFFERED" ? 3 : 1} />
        </div>
        <div className="relative p-6">
          <Pill tone={h.tone}>{h.label}</Pill>
          <p className="mt-4 max-w-[62%] text-[22px] font-bold leading-[1.35] text-ink">{app.rounds.title}</p>
          <p className="mt-3 max-w-[62%] text-[15px] leading-relaxed text-ink2">{payClosed ? "결제 전에 매칭 시각이 지나 이번 테이블에는 들어가지 못했어요. 빠져나간 돈은 없어요." : ended ? h.desc : app.match_reason ?? h.desc}</p>
          {money && <p className="mt-3 inline-flex rounded-full bg-paper px-3 py-1.5 text-[14px] font-bold text-ink">{money}</p>}
          {(app.application_status === "CANCELED" || app.match_status === "NO_MATCH" || app.attendance_status?.startsWith("CANCELED")) && (
            <Link href="/rounds" className="mt-4 flex h-12 w-fit items-center rounded-[14px] bg-accent px-5 text-[15px] font-bold text-white">다른 일정 보기</Link>
          )}
          {afterNote?.contact && (
            <Link href="/help" className="mt-2 inline-flex h-11 items-center text-[14px] font-semibold text-accent underline underline-offset-4">문의하기</Link>
          )}
          {/* 운영팀이 취소했거나 회차가 취소된 신청은 이유를 물을 곳을 바로 둔다 */}
          {app.match_reason && (app.application_status === "CANCELED" || app.attendance_status?.startsWith("CANCELED")) && (
            <a
              href={`mailto:help@wooyeon-table.app?subject=${encodeURIComponent(`[우연한 식탁] ${app.rounds.title} 취소 문의`)}`}
              className="mt-2 inline-flex h-11 items-center text-[14px] font-semibold text-accent underline underline-offset-4"
            >
              취소 이유 문의하기
            </a>
          )}
          {["WAITING", "MATCHING", "REALLOCATING"].includes(app.match_status) && paid && app.application_status !== "CANCELED" && new Date(app.rounds.match_at) > t && (
            <>
              <p className="mt-4 max-w-[58%] text-[14px] leading-relaxed text-muted">{fmtSlot(app.rounds.match_at)}에 테이블을 꾸려요.</p>
            </>
          )}
          {app.application_status !== "CANCELED" && cta && (
            <Link href={cta[1]} className="mt-6 flex h-[56px] items-center justify-center gap-1 rounded-[14px] bg-accent text-[17px] font-extrabold text-white active:scale-[.985]">
              {cta[0]} <ChevronRight size={20} />
            </Link>
          )}
          {app.application_status !== "CANCELED" && idle && (
            <p className="mt-5 rounded-[14px] bg-card px-4 py-3 text-[14px] leading-relaxed text-ink2">지금은 하실 일이 없어요. 결과가 나오면 알림과 홈 화면으로 바로 알려 드릴게요.</p>
          )}
        </div>
      </section>

      {app.match_status === "ALTERNATIVE_OFFERED" && <OfferBanner userId={me.id} applicationId={app.id} />}

      <SectionTitle>이렇게 진행돼요</SectionTitle>
      <section id="progress" className="scroll-mt-20 rounded-[20px] bg-card p-5">
        <ol>
          {steps.map((st, i) => {
            const now_ = i === current;
            return (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${st.done ? "bg-accent text-white" : now_ ? "border-2 border-accent" : "border-2 border-line bg-card"}`}>
                    {st.done ? <Check size={16} strokeWidth={3} /> : now_ ? <span className="size-3 rounded-full bg-accent" /> : null}
                  </span>
                  {i < steps.length - 1 && <span className={`my-1 w-0.5 flex-1 ${st.done ? "bg-accent" : "border-l-2 border-dashed border-line"}`} />}
                </div>
                <div className="pb-6">
                  <p className={`text-[16px] ${st.done || now_ ? "font-bold text-ink" : "font-semibold text-ink2"}`}>{st.label}</p>
                  {st.when && <p className="mt-0.5 text-[13px] text-muted">{st.when}</p>}
                  <p className="mt-0.5 text-[13px] text-muted">{st.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {moved && (
        <div className="mt-3 rounded-[20px] bg-card px-4 py-3.5 text-[14px] leading-relaxed text-ink2">
          <p>처음 테이블 인원이 줄어 같은 조건의 다른 테이블로 옮겨 드렸어요. 이 테이블이 마음에 들지 않으면 다른 방법을 고를 수 있어요.</p>
          <ConfirmSheet
            trigger={<button className="mt-1 inline-flex h-11 items-center text-[14px] font-bold text-accent">다른 방법 고르기</button>}
            title="옮긴 테이블에서 빠질까요?"
            body={<>이 테이블에서 빠지고 다른 일정으로 옮기기·자리 기다리기·이용권 보관·환불 중에 고를 수 있어요. 결제한 금액은 그대로예요.</>}
            confirmLabel="빠지고 다른 방법 고르기"
            action={declineReallocationAction}
            hidden={{ app_id: app.id }}
          />
        </div>
      )}

      {matched && app.attendance_status === "SCHEDULED" && app.dining_tables && (() => {
        const start = app.dining_tables.slots.starts_at;
        const rule = cancelRule(start, t);
        const remind = new Date(new Date(start).getTime() - 24 * 3600_000);
        return (
          <>
            {/* 하루 전 안내 시각이 지났으면 '다음 안내'를 보여 주지 않는다 */}
            {remind > t && (
              <p className="mt-3 rounded-[20px] bg-accent-soft px-4 py-3.5 text-[14px] text-accent">
                다음 안내: {fmtSlot(remind.toISOString())}에 시간·장소·예약명을 한 번 더 보내드려요.
              </p>
            )}
            {rule.kind !== "blocked" && (
              <div className="mt-6 text-center">
                <ConfirmSheet
                  trigger={<button className="inline-flex h-11 items-center px-4 text-[14px] font-medium text-muted underline underline-offset-4">참석 취소하기</button>}
                  title="참석을 취소할까요?"
                  body={<>{rule.message}. 단체방의 다른 분들께는 이름 없이 알려드려요.</>}
                  confirmLabel={rule.kind === "early" ? "취소하고 환불받기" : "환불 없이 취소하기"}
                  action={cancelAttendanceAction}
                  hidden={{ app_id: app.id }}
                />
              </div>
            )}
          </>
        );
      })()}

      <SectionTitle>고른 일정</SectionTitle>
      <List>
        {slots.map((s) => (
          <Row key={s.id}>
            <span className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CalendarDays size={20} /></span>
              <span>
                <span className="block text-[16px] font-bold text-ink">{fmtSlot(s.starts_at)}</span>
                <span className="block text-[13px] text-muted">{s.region}</span>
              </span>
            </span>
          </Row>
        ))}
      </List>
      {app.application_status !== "CANCELED" && app.match_status === "WAITING" && new Date(app.rounds.match_at) > t && (
        <p className="mt-2 px-1 text-[13px] leading-relaxed text-muted">동네나 날짜를 바꾸려면 아래에서 신청을 취소하고 다시 신청해 주세요. 매칭 시각 전이라 결제한 금액은 그대로 돌려드려요.</p>
      )}

      {app.application_status !== "CANCELED" && app.match_status === "WAITING" && new Date(app.rounds.match_at) > t && (
        <div className="mt-8 text-center">
          <ConfirmSheet
            trigger={<button className="inline-flex h-11 items-center px-4 text-[15px] font-semibold text-danger underline underline-offset-4">신청 취소하기</button>}
            title="신청을 취소할까요?"
            body={paid
              ? <>매칭 시각({fmtSlot(app.rounds.match_at)}) 전이라 결제한 금액은 전액 돌려드려요. 이용권으로 신청했다면 1회를 다시 쓸 수 있고, 멤버십은 기간 안에 다른 일정을 바로 신청할 수 있어요.</>
              : <>아직 결제 전이라 빠져나간 돈은 없어요. 취소하면 이 신청만 닫히고, 마감 전이면 같은 일정을 다시 신청할 수 있어요.</>}
            confirmLabel="신청 취소하기"
            action={cancelApplication}
            hidden={{ app_id: app.id }}
          />
        </div>
      )}
      <ErrorText msg={e} />

      <SectionTitle>환불 규정</SectionTitle>
      {/* 핵심 한 줄만 먼저, 나머지는 펼쳐 본다 */}
      <div className="rounded-[20px] bg-card px-5 text-[13px] leading-relaxed text-muted">
        <ul className="space-y-1.5 pt-4 text-[14px] text-ink2">
          {[0, 2, 3].map((i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{REFUND_POLICY[i]}</li>)}
        </ul>
      <details className="group/refund">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] font-semibold text-accent group-open/refund:hidden">나머지 규정 보기</summary>
        <ul className="space-y-1.5 pb-5">
          {REFUND_POLICY.filter((_, i) => ![0, 2, 3].includes(i)).map((r) => (
            <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
          ))}
        </ul>
      </details>
      </div>

      <p className="mt-8 text-center text-[13px] text-muted">
        <Link href="/rounds" className="inline-flex h-11 items-center px-4 underline underline-offset-4">다른 일정 보기</Link>
      </p>
    </Screen>
  );
}
