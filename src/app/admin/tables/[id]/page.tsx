import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { ATTEND, label } from "@/lib/labels";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TableDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { data } = await db()
    .from("dining_tables")
    .select("id,status,score,score_detail,explanation,reservation_name,confirmed_at,slots(starts_at,ends_at,region),venues(name,address,price_range),rounds(title)")
    .eq("id", id)
    .maybeSingle();
  const t = data as unknown as {
    id: string; status: string; score: number; explanation: { reasons?: string[]; origin?: string }; reservation_name: string | null; confirmed_at: string | null;
    slots: { starts_at: string; ends_at: string; region: string }; venues: { name: string; address: string; price_range: string | null } | null; rounds: { title: string };
  } | null;
  if (!t) notFound();
  const [{ data: apps }, { data: room }, { data: events }] = await Promise.all([
    db().from("applications").select("id,user_id,attendance_status,realloc_count,users(name,profiles(birth_year,gender,mbti,job))").eq("table_id", id),
    db().from("chat_rooms").select("id,created_at").eq("table_id", id).maybeSingle(),
    db().from("status_events").select("id,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "dining_table").eq("entity_id", id).order("created_at"),
  ]);
  const members = (apps ?? []) as unknown as { id: string; user_id: string; attendance_status: string | null; realloc_count: number; users: { name: string; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null } }[];
  const { data: msgs } = room ? await db().from("chat_messages").select("id,kind,body,created_at,meta").eq("room_id", room.id).order("created_at") : { data: [] };
  const { data: notes } = members.length
    ? await db().from("notifications").select("id,title,status,scheduled_at,sent_at,read_at,attempts,user_id").in("user_id", members.map((m) => m.user_id)).eq("link", `/tables/${id}`).order("scheduled_at")
    : { data: [] };
  const nameOf = new Map(members.map((m) => [m.user_id, m.users.name]));

  return (
    <div>
      <Link href="/admin/tables" className="text-[13px] text-muted hover:text-ink">← 테이블 목록</Link>
      <div className="mt-2">
        <PageHeader title={`${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)} ${t.slots.region}`} desc={`${t.rounds.title}, 확정 ${t.confirmed_at ? fmtDateTime(t.confirmed_at) : "-"}, 점수 ${Math.round(Number(t.score))}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title={`참가자 ${members.length}명`}>
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <Link href={`/admin/applicants/${m.id}`} className="font-semibold hover:underline">{m.users.name}</Link>
                  <span className="text-muted">{m.users.profiles ? `${m.users.profiles.birth_year}년생 ${m.users.profiles.gender === "M" ? "남" : "여"} ${m.users.profiles.mbti ?? ""} ${m.users.profiles.job ?? ""}` : ""}{m.realloc_count ? `, 재배치 ${m.realloc_count}` : ""}</span>
                  <Badge v={label(ATTEND, m.attendance_status)} />
                </li>
              ))}
            </ul>
            {t.explanation?.reasons?.length ? <p className="mt-3 text-[13px] text-muted">참가자에게 보여 준 이유: {t.explanation.reasons.join(", ")}</p> : null}
          </Panel>
          <Panel title="단체방">
            {!room ? <p className="text-[14px] text-danger">단체방이 없어요.</p> : (
              <ul className="space-y-2 text-[13px]">
                {(msgs ?? []).map((m) => (
                  <li key={m.id} className={`rounded-xl px-3 py-2 ${m.kind === "system" ? "bg-accent-soft/60" : "bg-paper"}`}>
                    <p className="text-[11px] text-muted">{m.kind === "system" ? `자동 게시${(m.meta as { type?: string })?.type ? ` · ${(m.meta as { type?: string }).type}` : ""}` : "참가자"} · {fmtDateTime(m.created_at)}</p>
                    <p className="mt-0.5 whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="식당">
            {t.venues ? (
              <dl className="space-y-1.5 text-[14px]">
                <div><dt className="inline text-muted">식당 </dt><dd className="inline font-semibold">{t.venues.name}</dd></div>
                <div className="text-muted">{t.venues.address}</div>
                <div><dt className="inline text-muted">예약명 </dt><dd className="inline">{t.reservation_name}</dd></div>
                <div><dt className="inline text-muted">가격대 </dt><dd className="inline">{t.venues.price_range ?? "-"}</dd></div>
                <div><dt className="inline text-muted">시간 </dt><dd className="inline">{fmtTime(t.slots.starts_at)}~{fmtTime(t.slots.ends_at)}</dd></div>
              </dl>
            ) : <p className="text-[14px] text-danger">배정된 식당이 없어요. 예외 처리함에서 다시 배정할 수 있어요.</p>}
          </Panel>
          <Panel title="안내 발송 상태">
            <ul className="divide-y divide-line text-[13px]">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{nameOf.get(n.user_id)} · {n.title}</span>
                  <Badge v={n.status === "sent" ? (n.read_at ? ["읽음", "leaf"] : ["보냄", "accent"]) : n.status === "pending" ? [`예약 ${fmtDateTime(n.scheduled_at)}`, "muted"] : [`실패 ${n.attempts}회`, "danger"]} />
                </li>
              ))}
              {!notes?.length && <li className="py-2 text-muted">보낸 안내가 없어요.</li>}
            </ul>
          </Panel>
          <Panel title="테이블 상태 이력">
            <ul className="space-y-1.5 text-[13px]">
              {(events ?? []).map((e) => <li key={e.id}><span className="text-muted">{fmtDateTime(e.created_at)}</span> {e.from_value ?? "-"} → <b>{e.to_value}</b>{e.reason ? `, ${e.reason}` : ""}</li>)}
              {!events?.length && <li className="text-muted">기록이 없어요.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
