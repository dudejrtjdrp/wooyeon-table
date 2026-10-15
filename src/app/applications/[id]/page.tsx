import { RoundTable } from "@/components/brand";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSheet, ErrorText, List, Pill, Row, Screen, SectionTitle } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime, fmtSlot } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";
import { cancelRule } from "@/lib/attendance";
import { REFUND_POLICY } from "@/lib/constants";
import { Toast } from "@/components/ui";
import { OfferBanner } from "@/components/offer-banner";
import { cancelApplication, cancelAttendanceAction } from "./actions";

export const dynamic = "force-dynamic";

type Slot = { id: string; region: string; starts_at: string };

export default async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e, m } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select(
      "id,user_id,application_status,payment_status,match_status,attendance_status,match_reason,realloc_count,table_id,submitted_at,payments(paid_at),dining_tables(slots(starts_at))," +
        "rounds(id,title,match_at,apply_deadline),application_slots(slots(id,region,starts_at))",
    )
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; application_status: string; payment_status: string; match_status: string;
    attendance_status: string | null; match_reason: string | null; realloc_count: number; table_id: string | null; submitted_at: string | null;
    payments: { paid_at: string | null } | null;
    dining_tables: { slots: { starts_at: string } } | null;
    rounds: { id: string; title: string; match_at: string; apply_deadline: string };
    application_slots: { slots: Slot }[];
  } | null;
  if (!app || app.user_id !== me.id) redirect("/");

  const t = await now();
  const h = headline(app);
  const slots = app.application_slots.map((x) => x.slots).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const paid = !["PENDING", "FAILED"].includes(app.payment_status);
  const matched = app.match_status === "CONFIRMED";

  const matchDone = !["WAITING", "MATCHING", "REALLOCATING"].includes(app.match_status) && paid;
  const steps = [
    { label: "신청", done: true, when: app.submitted_at ? fmtSlot(app.submitted_at).replace("저녁", "오후") : "", note: "신청이 완료됐어요." },
    { label: "결제", done: paid, when: app.payments?.paid_at ? fmtSlot(app.payments.paid_at).replace("저녁", "오후") : "", note: paid ? "결제가 완료됐어요." : "결제를 마쳐야 매칭에 들어가요." },
    { label: `자동 매칭 · ${fmtSlot(app.rounds.match_at)}`, done: matchDone, when: "", note: "신청 인원을 모아 테이블을 꾸려요." },
    { label: "테이블 확정 · 안내", done: matched, when: "", note: "매칭이 완료되면 확정된 식당과 동행한 분들을 알려드려요." },
    { label: "모임", done: app.attendance_status === "ATTENDED", when: "", note: "선정된 식당에서 즐거운 저녁 식사를 함께해요." },
  ];
  const current = steps.findIndex((x) => !x.done);
  const ctaHref = app.payment_status === "PENDING" || app.payment_status === "FAILED" ? `/pay/${app.id}` : matched && app.table_id ? `/tables/${app.table_id}` : app.match_status === "ALTERNATIVE_OFFERED" ? `/applications/${app.id}/resolve` : "#progress";
  const ctaLabel = app.payment_status === "PENDING" || app.payment_status === "FAILED" ? "결제 이어서 하기" : matched && app.table_id ? "테이블과 단체방 보기" : app.match_status === "ALTERNATIVE_OFFERED" ? "다음 방법 고르기" : "진행 상황 보기";

  return (
    <Screen title="내 신청" back="/rounds">
      <Toast msg={m} />
      <section className="animate-rise relative mt-3 overflow-hidden rounded-[24px] bg-field">
        <div className="pointer-events-none absolute right-4 top-6">
          <RoundTable size={104} filled={matched ? 6 : app.match_status === "ALTERNATIVE_OFFERED" ? 3 : 1} />
        </div>
        <div className="relative p-6">
          <Pill tone={h.tone}>{h.label}</Pill>
          <p className="mt-4 max-w-[62%] text-[24px] font-black leading-[1.35] text-ink">{app.rounds.title}</p>
          <p className="mt-3 max-w-[60%] text-[15px] leading-relaxed text-ink2">{app.match_reason ?? h.desc}</p>
          {!matched && paid && app.application_status !== "CANCELED" && new Date(app.rounds.match_at) > t && (
            <>
              <p className="mt-4 max-w-[58%] text-[14px] leading-relaxed text-muted">{fmtSlot(app.rounds.match_at)}에 테이블을 꾸려요.</p>
            </>
          )}
          {app.application_status !== "CANCELED" && (
            <Link href={ctaHref} className="mt-6 flex h-[56px] items-center justify-center gap-1 rounded-[14px] bg-accent text-[17px] font-extrabold text-white active:scale-[.985]">
              {ctaLabel} <ChevronRight size={20} />
            </Link>
          )}
        </div>
      </section>

      {app.match_status === "ALTERNATIVE_OFFERED" && <OfferBanner userId={me.id} applicationId={app.id} />}

      <SectionTitle>이렇게 진행돼요</SectionTitle>
      <section id="progress" className="scroll-mt-20 rounded-[22px] bg-field p-5">
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
                  <p className={`text-[16px] ${st.done || now_ ? "font-bold text-ink" : "font-semibold text-ink/80"}`}>{st.label}</p>
                  {st.when && <p className="mt-0.5 text-[13px] text-muted">{st.when}</p>}
                  <p className="mt-0.5 text-[13px] text-muted">{st.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {matched && app.attendance_status === "SCHEDULED" && app.dining_tables && (() => {
        const start = app.dining_tables.slots.starts_at;
        const rule = cancelRule(start, t);
        const remind = new Date(new Date(start).getTime() - 24 * 3600_000);
        return (
          <>
            <p className="mt-3 rounded-[20px] bg-accent-soft px-4 py-3.5 text-[14px] text-accent">
              다음 안내: {fmtDateTime(remind.toISOString())}에 시간·장소·예약명을 한 번 더 보내드려요.
            </p>
            {rule.kind !== "blocked" && (
              <div className="mt-6 text-center">
                <ConfirmSheet
                  trigger={<button className="text-[14px] font-medium text-muted underline underline-offset-4">참석 취소하기</button>}
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
          <Row key={s.id} right={<ChevronRight size={19} className="text-muted" />}>
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
        <div className="mt-8 text-center">
          <ConfirmSheet
            trigger={<button className="text-[15px] font-semibold text-danger underline underline-offset-4">신청 취소하기</button>}
            title="신청을 취소할까요?"
            body={<>매칭 시각({fmtDateTime(app.rounds.match_at)}) 전이라 결제한 금액은 전액 돌려드려요. 이용권으로 신청했다면 1회를 다시 쓸 수 있어요.</>}
            confirmLabel="신청 취소하기"
            action={cancelApplication}
            hidden={{ app_id: app.id }}
          />
        </div>
      )}
      <ErrorText msg={e} />

      <SectionTitle>환불 규정</SectionTitle>
      <ul className="space-y-1.5 rounded-[22px] bg-field p-5 text-[13px] leading-relaxed text-muted">
        {REFUND_POLICY.map((r) => (
          <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />{r}</li>
        ))}
      </ul>

      <p className="mt-8 text-center text-[13px] text-muted">
        <Link href="/rounds" className="underline underline-offset-4">다른 일정 보기</Link>
      </p>
    </Screen>
  );
}
