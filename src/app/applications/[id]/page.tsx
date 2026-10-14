import Link from "next/link";
import { redirect } from "next/navigation";
import { TableMark } from "@/components/brand";
import { ConfirmSheet, ErrorText, LinkButton, List, Pill, Row, Screen, SectionTitle } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
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
      "id,user_id,application_status,payment_status,match_status,attendance_status,match_reason,realloc_count,table_id,submitted_at,dining_tables(slots(starts_at))," +
        "rounds(id,title,match_at,apply_deadline),application_slots(slots(id,region,starts_at))",
    )
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; application_status: string; payment_status: string; match_status: string;
    attendance_status: string | null; match_reason: string | null; realloc_count: number; table_id: string | null;
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

  const steps = [
    { label: "신청", done: true, when: "" },
    { label: "결제", done: paid, when: "" },
    { label: "자동 매칭", done: !["WAITING", "MATCHING", "REALLOCATING"].includes(app.match_status) && paid, when: fmtDateTime(app.rounds.match_at) },
    { label: "테이블 확정·안내", done: matched, when: matched ? "" : "매칭 직후" },
    { label: "모임", done: app.attendance_status === "ATTENDED", when: "" },
  ];

  return (
    <Screen title="내 신청" back="/my-tables">
      <Toast msg={m} />
      <section className="mt-2 rounded-3xl bg-card p-6">
        <div className="flex items-start justify-between">
          <TableMark size={44} filled={matched ? 6 : paid ? 2 : 1} glow={matched} />
          <Pill tone={h.tone}>{h.label}</Pill>
        </div>
        <p className="mt-4 text-[13px] text-muted">{app.rounds.title}</p>
        <p className="mt-1 text-[20px] font-bold leading-snug tracking-[-0.02em]">{h.desc}</p>
        {app.match_reason && <p className="mt-2 text-[14px] leading-relaxed text-muted">{app.match_reason}</p>}
      </section>

      {app.match_status === "ALTERNATIVE_OFFERED" && <OfferBanner userId={me.id} applicationId={app.id} />}

      {app.payment_status === "PENDING" || app.payment_status === "FAILED" ? (
        <div className="mt-3"><LinkButton href={`/pay/${app.id}`}>결제 이어서 하기</LinkButton></div>
      ) : null}
      {matched && app.table_id ? (
        <div className="mt-3"><LinkButton href={`/tables/${app.table_id}`}>테이블과 단체방 보기</LinkButton></div>
      ) : null}
      {app.match_status === "ALTERNATIVE_OFFERED" ? (
        <div className="mt-3"><LinkButton href={`/applications/${app.id}/resolve`}>다음 방법 고르기</LinkButton></div>
      ) : null}

      <SectionTitle>진행 순서</SectionTitle>
      <section className="rounded-3xl bg-card p-5">
        <ol className="space-y-0">
          {steps.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 size-3.5 rounded-full ${s.done ? "bg-accent" : "border-2 border-line bg-card"}`} />
                {i < steps.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="pb-5">
                <p className={`text-[15px] ${s.done ? "font-medium" : "text-muted"}`}>{s.label}</p>
                {s.when && !s.done && <p className="text-[13px] text-muted">{s.when}</p>}
              </div>
            </li>
          ))}
        </ol>
        {!matched && paid && app.application_status !== "CANCELED" && new Date(app.rounds.match_at) > t && (
          <p className="text-[13px] text-muted">매칭 결과는 {fmtDateTime(app.rounds.match_at)}쯤 알림으로 보내드려요.</p>
        )}
      </section>

      {matched && app.attendance_status === "SCHEDULED" && app.dining_tables && (() => {
        const start = app.dining_tables.slots.starts_at;
        const rule = cancelRule(start, t);
        const remind = new Date(new Date(start).getTime() - 24 * 3600_000);
        return (
          <>
            <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-[14px] text-accent">
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
          <Row key={s.id} right={<span className="text-[15px] font-semibold">{s.region}</span>}>
            <span className="text-[15px]">{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}</span>
          </Row>
        ))}
      </List>

      {app.application_status !== "CANCELED" && app.match_status === "WAITING" && new Date(app.rounds.match_at) > t && (
        <div className="mt-8 text-center">
          <ConfirmSheet
            trigger={<button className="text-[14px] font-medium text-muted underline underline-offset-4">이 신청 취소하기</button>}
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
      <ul className="space-y-1.5 rounded-3xl bg-card p-5 text-[13px] leading-relaxed text-muted">
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
