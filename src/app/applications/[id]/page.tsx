import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, ErrorText, LinkButton, Pill, Screen } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";
import { cancelApplication } from "./actions";

export const dynamic = "force-dynamic";

type Slot = { id: string; region: string; starts_at: string };

export default async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e } = await searchParams;
  const { data } = await db()
    .from("applications")
    .select(
      "id,user_id,application_status,payment_status,match_status,attendance_status,match_reason,realloc_count,table_id,submitted_at," +
        "rounds(id,title,match_at,apply_deadline),application_slots(slots(id,region,starts_at))",
    )
    .eq("id", id)
    .maybeSingle();
  const app = data as unknown as {
    id: string; user_id: string; application_status: string; payment_status: string; match_status: string;
    attendance_status: string | null; match_reason: string | null; realloc_count: number; table_id: string | null;
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
    <Screen title="내 신청" back="/">
      <Card className="mt-2">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">{app.rounds.title}</p>
          <Pill tone={h.tone}>{h.label}</Pill>
        </div>
        <p className="mt-3 text-[17px] font-semibold leading-snug">{h.desc}</p>
        {app.match_reason && <p className="mt-2 text-[14px] leading-relaxed text-muted">{app.match_reason}</p>}
      </Card>

      {app.payment_status === "PENDING" || app.payment_status === "FAILED" ? (
        <div className="mt-4"><LinkButton href={`/pay/${app.id}`}>결제 이어서 하기</LinkButton></div>
      ) : null}
      {matched && app.table_id ? (
        <div className="mt-4"><LinkButton href={`/tables/${app.table_id}`}>테이블과 단체방 보기</LinkButton></div>
      ) : null}
      {app.match_status === "ALTERNATIVE_OFFERED" ? (
        <div className="mt-4"><LinkButton href={`/applications/${app.id}/resolve`}>다음 방법 고르기</LinkButton></div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">진행 순서</h2>
        <ol className="mt-3 space-y-0">
          {steps.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 size-3 rounded-full ${s.done ? "bg-leaf" : "border-2 border-line bg-paper"}`} />
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

      <section className="mt-6">
        <h2 className="text-[15px] font-semibold">고른 일정</h2>
        <ul className="mt-3 space-y-2">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3 text-[14px]">
              <span>{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}</span>
              <span className="font-medium">{s.region}</span>
            </li>
          ))}
        </ul>
      </section>

      {app.application_status !== "CANCELED" && app.match_status === "WAITING" && new Date(app.rounds.match_at) > t && (
        <form action={cancelApplication} className="mt-8 rounded-xl border border-line bg-card p-4">
          <input type="hidden" name="app_id" value={app.id} />
          <p className="text-[14px] font-medium">신청 취소</p>
          <p className="mt-1 text-[13px] text-muted">매칭 시각({fmtDateTime(app.rounds.match_at)}) 전까지는 취소할 수 있어요. 결제했다면 전액 돌려드려요.</p>
          <button className="mt-3 text-[14px] text-accent underline underline-offset-4">이 신청 취소하기</button>
        </form>
      )}
      <ErrorText msg={e} />

      <p className="mt-8 text-center text-[13px] text-muted">
        <Link href="/rounds" className="underline underline-offset-4">다른 일정 보기</Link>
      </p>
    </Screen>
  );
}
