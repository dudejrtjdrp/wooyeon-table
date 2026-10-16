import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { ATTEND, actorLabel, ageBand, eventText, label } from "@/lib/labels";
import { now } from "@/lib/clock";
import { DEFAULT_SETTINGS } from "@/lib/matching/types";
import { ACTIVE, siblingTables } from "@/lib/admin-ops";
import { seatCandidates } from "@/lib/attendance";
import { TYPE_LABEL } from "@/lib/contents";
import { pickContents } from "@/lib/pipeline";
import { db } from "@/lib/supabase";
import { CHANNEL_LABEL, type Channel } from "@/lib/reservations";
import { reservationAction } from "./actions";
import { OpsPanel } from "./ops-panel";

const OFFER: Record<string, [string, "muted" | "accent" | "leaf" | "danger"]> = {
  pending: ["답 기다림", "accent"],
  accepted: ["합류", "leaf"],
  declined: ["거절", "muted"],
  expired: ["기한 지남", "muted"],
  void: ["무효", "muted"],
};

export const dynamic = "force-dynamic";

export default async function TableDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ex?: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const { ex } = await searchParams;
  const { data } = await db()
    .from("dining_tables")
    .select("id,status,slot_id,score,score_detail,explanation,reservation_name,confirmed_at,slots(starts_at,ends_at,region),venues(name,address,price_range,rating,booking_channel),rounds(title)")
    .eq("id", id)
    .maybeSingle();
  const t = data as unknown as {
    id: string; status: string; slot_id: string; score: number; score_detail: { gate?: number } | null; explanation: { reasons?: string[]; origin?: string }; reservation_name: string | null; confirmed_at: string | null;
    slots: { starts_at: string; ends_at: string; region: string }; venues: { name: string; address: string; price_range: string | null; rating: number | null; booking_channel: string | null } | null; rounds: { title: string };
  } | null;
  if (!t) notFound();
  const { data: resv } = await db().from("reservations").select("id,channel,status,party_size,reservation_name,external_ref,deep_link,attempts,last_error,mode,updated_at").eq("table_id", id).maybeSingle();
  const [{ data: apps }, { data: room }, { data: events }] = await Promise.all([
    db().from("applications").select("id,user_id,attendance_status,realloc_count,users(name,profiles(birth_year,gender,mbti,job))").eq("table_id", id),
    db().from("chat_rooms").select("id,created_at").eq("table_id", id).maybeSingle(),
    db().from("status_events").select("id,entity_type,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "dining_table").eq("entity_id", id).order("created_at"),
  ]);
  const adminIds = [...new Set((events ?? []).filter((e) => e.actor.startsWith("admin:")).map((e) => e.actor.slice(6)))];
  const { data: admins } = adminIds.length ? await db().from("users").select("id,name").in("id", adminIds) : { data: [] };
  const adminName = new Map((admins ?? []).map((a) => [a.id, a.name]));
  const { data: linkedEx } = ex ? await db().from("exceptions").select("id,kind,reason,status").eq("id", ex).maybeSingle() : { data: null };
  const members = (apps ?? []) as unknown as { id: string; user_id: string; attendance_status: string | null; realloc_count: number; users: { name: string; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null } }[];
  const { data: msgs } = room ? await db().from("chat_messages").select("id,kind,body,created_at,meta").eq("room_id", room.id).order("created_at") : { data: [] };
  const { data: notes } = members.length
    ? await db().from("notifications").select("id,title,status,scheduled_at,sent_at,read_at,attempts,user_id").in("user_id", members.map((m) => m.user_id)).eq("link", `/tables/${id}`).order("scheduled_at")
    : { data: [] };
  const nameOf = new Map(members.map((m) => [m.user_id, m.users.name]));
  const active = ACTIVE.includes(t.status);
  const [siblings, { data: offers }, contents, waiters] = await Promise.all([
    active ? siblingTables(id) : Promise.resolve([]),
    db().from("seat_offers").select("id,status,expires_at,responded_at,created_at,users(name)").eq("table_id", id).order("created_at"),
    pickContents(id),
    active ? seatCandidates(id) : Promise.resolve([]),
  ]);
  // 생년 전체 대신 연령대와 테이블 나이 차만 보여 준다(8살 규칙 확인용)
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(await now()));
  const years = members.map((m) => m.users.profiles?.birth_year).filter((y): y is number => !!y);
  const ageGap = years.length ? Math.max(...years) - Math.min(...years) : null;
  const seated = members.filter((m) => m.attendance_status === "SCHEDULED" || m.attendance_status === "ATTENDED");

  return (
    <div>
      <Link href="/admin/tables" className="text-[13px] text-muted hover:text-ink">← 테이블 목록</Link>
      <div className="mt-2">
        <PageHeader title={`${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)} ${t.slots.region}`} desc={`${t.rounds.title}, 확정 ${t.confirmed_at ? fmtDateTime(t.confirmed_at) : "-"}, 점수 ${Math.round(Number(t.score))}${typeof t.score_detail?.gate === "number" ? ` (확정 판정 ${Math.round(t.score_detail.gate)}점, 성비 감점 제외)` : ""}`} />
      </div>
      {linkedEx?.status === "open" && (
        <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
          <b>예외 처리 중:</b> {linkedEx.reason} · 오른쪽 &lsquo;운영자 긴급 수정&rsquo;으로 고치면 이 예외도 함께 닫혀요. <Link href="/admin/exceptions" className="font-semibold underline underline-offset-2">예외 처리함으로</Link>
        </p>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title={`참가자 ${members.length}명`} action={ageGap !== null ? <span className={`text-[13px] font-semibold ${ageGap > DEFAULT_SETTINGS.maxAgeGap ? "text-danger" : "text-muted"}`}>나이 차 {ageGap}살 · {DEFAULT_SETTINGS.maxAgeGap}살 이내 규칙{ageGap > DEFAULT_SETTINGS.maxAgeGap ? " 넘음" : ""}</span> : undefined}>
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <Link href={`/admin/applicants/${m.id}`} className="font-semibold hover:underline">{m.users.name}</Link>
                  <span className="text-muted">{m.users.profiles ? `${ageBand(m.users.profiles.birth_year, year)} ${m.users.profiles.gender === "M" ? "남" : "여"} ${m.users.profiles.mbti ?? ""} ${m.users.profiles.job ?? ""}` : ""}{m.realloc_count ? `, 재배치 ${m.realloc_count}` : ""}</span>
                  <Badge v={label(ATTEND, m.attendance_status)} />
                </li>
              ))}
            </ul>
            {t.explanation?.reasons?.length ? <p className="mt-3 text-[13px] text-muted">참가자에게 보여 준 이유: {t.explanation.reasons.join(", ")}</p> : null}
          </Panel>
          <Panel title="대화 콘텐츠 (모임 시작 때 자동 게시)">
            <p className="text-[13px] text-muted">테이블 유형: {contents.types.map((x) => TYPE_LABEL[x] ?? x).join(", ") || "-"}{contents.common.length ? ` · 공통 관심사 ${contents.common.join(", ")}` : ""}</p>
            <ol className="mt-2 space-y-1.5 text-[14px]">
              {contents.topics.map((c, i) => <li key={c.id}>{i + 1}. {c.body}</li>)}
              {contents.icebreaker && <li className="text-muted">아이스브레이킹 · {contents.icebreaker.body}</li>}
            </ol>
            <Link href="/admin/contents" className="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline">콘텐츠와 노출 규칙 관리 →</Link>
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
          <Panel title="운영자 긴급 수정" className="scroll-mt-6">
            <div id="ops" />
            {me.level === "full" ? (
              <OpsPanel tableId={id} slotId={t.slot_id} active={active} exceptionId={linkedEx?.status === "open" ? linkedEx.id : undefined} members={seated.map((m) => ({ id: m.id, name: m.users.name }))} siblings={siblings} />
            ) : <p className="text-[13px] text-muted">조회 전용 계정이라 긴급 수정을 할 수 없어요.</p>}
          </Panel>
          <Panel title="빈자리 제안 (대기자 자동 전환)">
            <ul className="divide-y divide-line text-[13px]">
              {(offers ?? []).map((o) => {
                const x = o as unknown as { id: string; status: string; expires_at: string; users: { name: string } };
                return (
                  <li key={x.id} className="flex items-center justify-between py-2">
                    <span>{x.users.name}</span>
                    <Badge v={OFFER[x.status] ?? [x.status, "muted"]} />
                    <span className="text-muted">{x.status === "pending" ? `~${fmtDateTime(x.expires_at)}` : ""}</span>
                  </li>
                );
              })}
              {!offers?.length && <li className="py-2 text-muted">빈자리가 생긴 적이 없어요.</li>}
            </ul>
            {active && <p className="mt-2 text-[12px] text-muted">다음 순서 대기자 {waiters.length}명{waiters.length ? `: ${waiters.slice(0, 3).map((w) => w.name).join(", ")}` : ""}</p>}
          </Panel>
          <Panel title="식당">
            {t.venues ? (
              <dl className="space-y-1.5 text-[14px]">
                <div><dt className="inline text-muted">식당 </dt><dd className="inline font-semibold">{t.venues.name}</dd></div>
                <div className="text-muted">{t.venues.address}</div>
                <div><dt className="inline text-muted">예약명 </dt><dd className="inline">{t.reservation_name}</dd></div>
                <div><dt className="inline text-muted">가격대 </dt><dd className="inline">{t.venues.price_range ?? "-"}</dd></div>
                <div><dt className="inline text-muted">평점 </dt><dd className="inline">{t.venues.rating ?? "-"}</dd></div>
                <div><dt className="inline text-muted">시간 </dt><dd className="inline">{fmtTime(t.slots.starts_at)}~{fmtTime(t.slots.ends_at)}</dd></div>
              </dl>
            ) : <p className="text-[14px] text-danger">배정된 식당이 없어요. 예외 처리함에서 다시 배정할 수 있어요.</p>}
          </Panel>
          <div id="reservation" className="scroll-mt-6">
          <Panel title="식당 예약">
            {resv ? (
              <div className="space-y-2 text-[14px]">
                <div className="flex items-center gap-2">
                  <Badge v={[{ REQUESTED: "예약 요청 중", CONFIRMED: "예약 확정", FAILED: "예약 실패", CANCELED: "예약 취소" }[resv.status as string] ?? resv.status, resv.status === "CONFIRMED" ? "leaf" : resv.status === "FAILED" ? "danger" : "candle"]} />
                  <span className="text-muted">{CHANNEL_LABEL[resv.channel as Channel]} · {resv.party_size}명 · {resv.mode === "mock" ? "모의 연동" : resv.mode === "manual" ? "운영자 직접 예약" : "실연동"}</span>
                </div>
                {resv.external_ref && <div><span className="text-muted">예약번호 </span><b className="tabular-nums">{resv.external_ref}</b></div>}
                {resv.last_error && <div className="text-danger">마지막 오류: {resv.last_error} (시도 {resv.attempts}회)</div>}
                {resv.deep_link && <a href={resv.deep_link} target="_blank" rel="noreferrer" className="inline-block font-semibold text-accent hover:underline">{CHANNEL_LABEL[resv.channel as Channel]}에서 식당 열기</a>}
                {resv.status !== "CONFIRMED" && me.level === "full" && (
                  <form action={reservationAction} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="table_id" value={t.id} />
                    <input name="ref" placeholder="직접 예약했다면 예약번호" className="h-10 min-w-40 flex-1 rounded-xl border border-line bg-field px-3 text-[13px]" />
                    <button name="op" value="manual" className="h-10 rounded-xl border border-accent/40 px-3 text-[13px] font-semibold text-accent">예약 완료로 표시</button>
                    <button name="op" value="retry" className="h-10 rounded-xl bg-accent px-3 text-[13px] font-semibold text-white">다시 시도</button>
                  </form>
                )}
              </div>
            ) : <p className="text-[14px] text-muted">{t.venues ? "아직 예약 요청이 없어요." : "식당이 정해지면 예약을 요청해요."}</p>}
          </Panel>
          </div>
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
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  <span className="text-muted">{fmtDateTime(e.created_at)} · {actorLabel(e.actor, adminName)}</span>
                  <span className="block text-ink">{eventText(e)}</span>
                  {e.reason && <span className="block text-[12px] text-muted">{e.reason}</span>}
                </li>
              ))}
              {!events?.length && <li className="text-muted">기록이 없어요.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
