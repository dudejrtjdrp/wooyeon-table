import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel, btnLight, ctl } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { ACCOUNT, APP_STATUS, ATTEND, FIELD, MATCH, PAYMENT, label } from "@/lib/labels";
import { db } from "@/lib/supabase";
import { setAccountStatus } from "./actions";

export const dynamic = "force-dynamic";

const VALUE_MAPS: Record<string, Record<string, [string, "muted" | "accent" | "leaf" | "ink" | "candle" | "danger"]>> = {
  payment_status: PAYMENT,
  match_status: MATCH,
  attendance_status: ATTEND,
  account_status: ACCOUNT,
  application_status: APP_STATUS,
};
const val = (field: string, v: string | null) => (v ? VALUE_MAPS[field]?.[v]?.[0] ?? v : "없음");
const actorName = (a: string) => (a === "system" ? "자동" : a.startsWith("admin:") ? "운영자" : a.startsWith("user:") ? "참가자" : a);

type App = {
  id: string; user_id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null;
  realloc_count: number; match_reason: string | null; submitted_at: string; table_id: string | null;
  rounds: { title: string };
  users: { id: string; name: string; login_id: string; phone: string | null; email: string | null; account_status: string; created_at: string; phone_verified_at: string | null;
    profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null; interests: string[]; my_traits: string[]; wanted_traits: string[]; price_range: string | null; food_restrictions: string | null } | null };
  dining_tables: { id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null } | null;
};

export default async function ApplicantDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { data } = await db()
    .from("applications")
    .select("id,user_id,application_status,payment_status,match_status,attendance_status,realloc_count,match_reason,submitted_at,table_id,rounds(title),users(id,name,login_id,phone,email,account_status,created_at,phone_verified_at,profiles(*)),dining_tables(id,slots(starts_at,region),venues(name))")
    .eq("id", id)
    .maybeSingle();
  const a = data as unknown as App | null;
  if (!a) notFound();
  const u = a.users;

  const [{ data: events }, { data: userEvents }, { data: notes }, { data: history }, { data: ids }, { data: reportsAgainst }] = await Promise.all([
    db().from("status_events").select("id,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "application").eq("entity_id", id).order("created_at"),
    db().from("status_events").select("id,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "user").eq("entity_id", u.id).order("created_at"),
    db().from("notifications").select("id,title,status,scheduled_at,sent_at,read_at").eq("user_id", u.id).order("scheduled_at", { ascending: false }).limit(15),
    db().from("applications").select("id,match_status,attendance_status,rounds(title)").eq("user_id", u.id).neq("id", id).order("created_at", { ascending: false }),
    db().from("user_identities").select("provider").eq("user_id", u.id),
    db().from("safety_reports").select("id,reason,created_at").eq("reported_id", u.id),
  ]);
  const timeline = [...(events ?? []), ...(userEvents ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at));
  const p = u.profiles;

  return (
    <div>
      <Link href="/admin/applicants" className="text-[13px] text-muted hover:text-ink">← 신청자 목록</Link>
      <div className="mt-2">
        <PageHeader
          title={u.name}
          desc={`${a.rounds.title} 신청${a.submitted_at ? `, ${fmtDateTime(a.submitted_at)}` : ""}`}
          actions={<Badge v={label(ACCOUNT, u.account_status)} />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Panel title="지금 상태">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["신청", label(APP_STATUS, a.application_status)],
                ["결제", label(PAYMENT, a.payment_status)],
                ["매칭", label(MATCH, a.match_status)],
                ["참석", label(ATTEND, a.attendance_status)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-paper p-3">
                  <p className="text-[12px] text-muted">{k as string}</p>
                  <div className="mt-1.5"><Badge v={v as [string, "muted"]} /></div>
                </div>
              ))}
            </div>
            {a.match_reason && <p className="mt-4 text-[14px] leading-relaxed text-muted">{a.match_reason}</p>}
            {a.dining_tables && (
              <p className="mt-3 text-[14px]">
                테이블: {fmtDate(a.dining_tables.slots.starts_at)} {fmtTime(a.dining_tables.slots.starts_at)} {a.dining_tables.slots.region}
                {a.dining_tables.venues ? `, ${a.dining_tables.venues.name}` : ""}
              </p>
            )}
          </Panel>

          <Panel title="상태 이력">
            {!timeline.length && <p className="text-[14px] text-muted">기록이 없어요.</p>}
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {timeline.map((e) => (
                <li key={`${e.field}-${e.id}`} className="relative">
                  <span className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 border-card ${e.actor === "system" ? "bg-accent" : e.actor.startsWith("admin") ? "bg-danger" : "bg-leaf"}`} />
                  <p className="text-[14px]">
                    <b>{FIELD[e.field] ?? e.field}</b> {val(e.field, e.from_value)} → <b>{val(e.field, e.to_value)}</b>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {fmtDateTime(e.created_at)}, {actorName(e.actor)}{e.reason ? `, ${e.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="받은 알림">
            <ul className="divide-y divide-line">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0 truncate">{n.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted">
                    {fmtDateTime(n.sent_at ?? n.scheduled_at)}
                    <Badge v={n.status === "sent" ? (n.read_at ? ["읽음", "leaf"] : ["보냄", "accent"]) : n.status === "pending" ? ["예약", "muted"] : ["실패", "danger"]} />
                  </span>
                </li>
              ))}
              {!notes?.length && <li className="py-2 text-[14px] text-muted">보낸 알림이 없어요.</li>}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="회원 정보">
            <dl className="space-y-2 text-[14px]">
              {[
                ["가입", fmtDate(u.created_at)],
                ["로그인", (ids ?? []).map((i) => ({ kakao: "카카오", naver: "네이버", google: "Google" })[i.provider as "kakao"]).join(", ") || "휴대폰 번호"],
                ["휴대폰", `${u.phone ?? "-"}${u.phone_verified_at ? " (인증됨)" : ""}`],
                ["프로필", p ? `${p.birth_year}년생 ${p.gender === "M" ? "남" : "여"}${p.mbti ? `, ${p.mbti}` : ""}` : "-"],
                ["하는 일", p?.job ?? "-"],
                ["관심사", p?.interests?.join(", ") || "-"],
                ["성향", p?.my_traits?.join(", ") || "-"],
                ["만나고 싶은 사람", p?.wanted_traits?.join(", ") || "-"],
                ["가격대", p?.price_range ?? "-"],
                ["못 먹는 음식", p?.food_restrictions ?? "없음"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="참가 기록">
            <ul className="space-y-2 text-[14px]">
              {(history ?? []).map((h) => {
                const row = h as unknown as { id: string; match_status: string; attendance_status: string | null; rounds: { title: string } };
                return (
                  <li key={row.id} className="flex items-center justify-between">
                    <Link href={`/admin/applicants/${row.id}`} className="hover:underline">{row.rounds.title}</Link>
                    <Badge v={row.attendance_status ? label(ATTEND, row.attendance_status) : label(MATCH, row.match_status)} />
                  </li>
                );
              })}
              {!history?.length && <li className="text-muted">이번이 첫 신청이에요.</li>}
            </ul>
            {!!reportsAgainst?.length && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">신고 {reportsAgainst.length}건 받음</p>}
          </Panel>

          <Panel title="계정 조치">
            <form action={setAccountStatus} className="space-y-2">
              <input type="hidden" name="user_id" value={u.id} />
              <input type="hidden" name="app_id" value={a.id} />
              <select name="to" defaultValue={u.account_status} className={`${ctl} w-full`}>
                {Object.entries(ACCOUNT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input name="note" placeholder="이유 (상태 이력에 남아요)" className={`${ctl} w-full`} />
              <button className={`${btnLight} w-full`}>상태 바꾸기</button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
