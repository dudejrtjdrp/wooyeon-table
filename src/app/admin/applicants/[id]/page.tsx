import { CalendarDays, Check, ChevronRight, PartyPopper } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Panel, btnLight, ctl, th } from "@/components/admin-ui";
import { IMG, Optional, Required } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtSlot } from "@/lib/format";
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

  const paid = !["PENDING", "FAILED"].includes(a.payment_status);
  const steps: { l: string; done: boolean }[] = [
    { l: a.application_status === "CANCELED" ? "신청 취소" : "신청 접수", done: a.application_status !== "DRAFT" },
    { l: label(PAYMENT, a.payment_status)[0], done: paid },
    { l: label(MATCH, a.match_status)[0], done: a.match_status === "CONFIRMED" },
    { l: a.attendance_status ? label(ATTEND, a.attendance_status)[0] : "참석 전", done: a.attendance_status === "ATTENDED" },
  ];
  const cur = steps.findIndex((x) => !x.done);
  const maskPhone = (ph: string | null) => (ph ? ph.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-****-$3") : "-");

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -right-9 -top-8 hidden h-[170px] w-[420px] lg:block" style={{ maskImage: "radial-gradient(90% 100% at 80% 20%, #000 45%, transparent 85%)", WebkitMaskImage: "radial-gradient(90% 100% at 80% 20%, #000 45%, transparent 85%)" }}>
        <Image src={IMG.profileRestaurant} alt="" fill sizes="420px" className="object-cover" />
      </div>
      <p className="relative text-[14px] text-muted"><Link href="/admin/applicants" className="hover:text-ink">신청자·결제</Link> / {u.name}</p>
      <div className="relative mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">{u.name}님의 신청</h1>
        <Badge v={label(ACCOUNT, u.account_status)} />
      </div>
      <p className="relative mt-1 text-[15px] text-muted">{a.rounds.title}{a.submitted_at ? ` · ${fmtDateTime(a.submitted_at)} 신청` : ""}</p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="신청 진행 상태">
            <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {steps.map((st, i) => (
                <li key={i} className={`flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-center text-[14px] font-semibold ${st.done ? "bg-leaf/10 text-leaf" : i === cur ? "bg-accent-soft text-accent ring-1 ring-accent/50" : "bg-field text-muted"}`}>
                  <span className={`flex size-7 items-center justify-center rounded-full text-[13px] ${st.done ? "bg-leaf text-white" : i === cur ? "bg-accent text-white" : "bg-line text-muted"}`}>{st.done ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
                  {st.l}
                </li>
              ))}
            </ol>
            {(a.match_reason || a.dining_tables) && (
              <div className="mt-4 rounded-2xl bg-accent-soft/50 p-4">
                {a.match_reason && <p className="flex items-start gap-2 text-[15px] font-semibold text-accent"><PartyPopper size={19} className="mt-0.5 shrink-0" />{a.match_reason}</p>}
                {a.dining_tables && (
                  <Link href={`/admin/tables/${a.dining_tables.id}`} className="mt-3 flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-[15px] text-ink">
                    <CalendarDays size={19} className="text-accent" />
                    <span className="flex-1 font-semibold">{fmtSlot(a.dining_tables.slots.starts_at)} <span className="font-normal text-muted">| {a.dining_tables.slots.region}{a.dining_tables.venues ? ` · ${a.dining_tables.venues.name}` : ""}</span></span>
                    <ChevronRight size={18} className="text-muted" />
                  </Link>
                )}
              </div>
            )}
          </Panel>

          <Panel title="상태 이력">
            {!timeline.length && <p className="text-[14px] text-muted">기록이 없어요.</p>}
            <ol className="space-y-2.5">
              {timeline.map((e) => (
                <li key={`${e.field}-${e.id}`} className="grid grid-cols-[14px_130px_60px_1fr] items-start gap-3 text-[14px]">
                  <span className={`mt-1.5 size-2.5 rounded-full ${e.actor === "system" ? "bg-accent" : e.actor.startsWith("admin") ? "bg-danger" : "bg-leaf"}`} />
                  <span className="tabular-nums text-muted">{fmtDateTime(e.created_at).replace(/\(.\) /, "")}</span>
                  <span className="text-muted">{actorName(e.actor)}</span>
                  <span className="text-ink">
                    {FIELD[e.field] ?? e.field} {val(e.field, e.from_value)} → <b>{val(e.field, e.to_value)}</b>
                    {e.reason && <span className="block text-[12px] text-muted">{e.reason}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="받은 알림">
            <table className="w-full text-[14px]">
              <thead><tr>{["알림 내용", "발송 시간", "상태"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {(notes ?? []).map((n) => (
                  <tr key={n.id}>
                    <td className="max-w-0 truncate px-4 py-2.5 text-ink">{n.title}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{fmtDateTime(n.sent_at ?? n.scheduled_at)}</td>
                    <td className="px-4 py-2.5"><Badge v={n.status === "sent" ? (n.read_at ? ["읽음", "accent"] : ["보냄", "accent"]) : n.status === "pending" ? ["예약", "muted"] : ["실패", "danger"]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!notes?.length && <p className="py-3 text-[14px] text-muted">보낸 알림이 없어요.</p>}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="회원 정보">
            <dl className="space-y-2.5 text-[14px] text-ink">
              {[
                ["가입", fmtDate(u.created_at)],
                ["로그인", (ids ?? []).map((i) => ({ kakao: "카카오", naver: "네이버", google: "Google" })[i.provider as "kakao"]).join(", ") || "휴대폰 번호"],
                ["연락처", <span key="ph" className="flex items-center gap-2">{maskPhone(u.phone)}{u.phone_verified_at && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">인증 완료</span>}</span>],
                ["프로필", p ? `${p.birth_year}년생 ${p.gender === "M" ? "남" : "여"}${p.mbti ? `, ${p.mbti}` : ""}` : "-"],
                ["하는 일", p?.job ?? "-"],
                ["관심사", p?.interests?.join(", ") || "-"],
                ["성향", p?.my_traits?.join(", ") || "-"],
                ["만나고 싶은 사람", p?.wanted_traits?.join(", ") || "-"],
                ["가격대", p?.price_range ?? "-"],
                ["못 먹는 음식", p?.food_restrictions ?? "없음"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-muted">{k}</dt>
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
            <form action={setAccountStatus} className="space-y-3">
              <input type="hidden" name="user_id" value={u.id} />
              <input type="hidden" name="app_id" value={a.id} />
              <label className="flex items-center gap-3 text-[14px] text-muted">
                <span className="w-24 shrink-0">계정 상태<Required /></span>
                <select name="to" defaultValue={u.account_status} className={`${ctl} w-full`}>
                  {Object.entries(ACCOUNT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="flex items-start gap-3 text-[14px] text-muted">
                <span className="w-24 shrink-0 pt-2.5">사유<Optional /></span>
                <textarea name="note" rows={3} placeholder="사유를 입력해 주세요 (상태 이력에 남아요)" className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-accent" />
              </label>
              <button className={`${btnLight} w-full`}>상태 바꾸기</button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
