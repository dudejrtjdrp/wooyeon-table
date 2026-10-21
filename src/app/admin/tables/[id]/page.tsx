import { isBot } from "@/lib/sim/persona-id";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel, Term, btnInk, ctl } from "@/components/admin-ui";
import { CHAT_POST, TIP, reasonText } from "@/lib/admin-glossary";
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
import { canSwapVenue } from "@/lib/admin-manual-rules";
import { venueSwapOptions } from "@/lib/admin-manual";
import { ConfirmButton, SubmitButton } from "../../confirm-button";
import { reservationAction, venueAction } from "./actions";
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
    db().from("applications").select("id,user_id,attendance_status,realloc_count,users(name,login_id,is_demo,profiles(birth_year,gender,mbti,job))").eq("table_id", id),
    db().from("chat_rooms").select("id,created_at").eq("table_id", id).maybeSingle(),
    db().from("status_events").select("id,entity_type,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "dining_table").eq("entity_id", id).order("created_at"),
  ]);
  const adminIds = [...new Set((events ?? []).filter((e) => e.actor.startsWith("admin:")).map((e) => e.actor.slice(6)))];
  const { data: admins } = adminIds.length ? await db().from("users").select("id,name").in("id", adminIds) : { data: [] };
  const adminName = new Map((admins ?? []).map((a) => [a.id, a.name]));
  const { data: linkedEx } = ex ? await db().from("exceptions").select("id,kind,reason,status").eq("id", ex).maybeSingle() : { data: null };
  const members = (apps ?? []) as unknown as { id: string; user_id: string; attendance_status: string | null; realloc_count: number; users: { name: string; login_id?: string; is_demo?: boolean; profiles: { birth_year: number; gender: string; mbti: string | null; job: string | null } | null } }[];
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
  const clock = await now();
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(clock));
  // 운영자 식당 바꾸기: 모임 시작 전, 같은 동네·일정에서 자리가 남은 식당만 (lib/admin-manual-rules.ts)
  const swap = canSwapVenue({ status: t.status, hasVenue: !!t.venues, startsAt: t.slots.starts_at, now: clock });
  const swapOptions = swap.ok && me.level === "full" ? await venueSwapOptions(id) : [];
  const years = members.map((m) => m.users.profiles?.birth_year).filter((y): y is number => !!y);
  const ageGap = years.length ? Math.max(...years) - Math.min(...years) : null;
  const seated = members.filter((m) => m.attendance_status === "SCHEDULED" || m.attendance_status === "ATTENDED");

  return (
    <div>
      <Link href="/admin/tables" className="text-[13px] text-muted hover:text-ink">← 테이블 목록</Link>
      <div className="mt-2">
        <PageHeader
          title={`${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)} ${t.slots.region}`}
          desc={<>{t.rounds.title} · 확정 {t.confirmed_at ? fmtDateTime(t.confirmed_at) : "-"} · <Term tip={TIP.매칭점수}>매칭 점수</Term> {Math.round(Number(t.score))}점{typeof t.score_detail?.gate === "number" ? ` (확정 판정 ${Math.round(t.score_detail.gate)}점, 성비 감점 제외)` : ""}</>}
          how={["참가자·식당·예약 상태 확인", "'안내 발송 상태'에서 안 나간 안내 확인", <>문제가 있으면 오른쪽 <Term tip={TIP.긴급수정}>긴급 수정</Term>(사유 필수)</>]}
        />
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
                  {isBot(m.users) && <span title="시연용 봇 계정이에요" className="ml-1.5 rounded-full bg-field px-2 py-0.5 text-[11px] font-semibold text-muted">시연 봇</span>}
                  <span className="text-muted">{m.users.profiles ? `${ageBand(m.users.profiles.birth_year, year)} ${m.users.profiles.gender === "M" ? "남" : "여"} ${m.users.profiles.mbti ?? ""} ${m.users.profiles.job ?? ""}` : ""}{m.realloc_count ? `, 재배치 ${m.realloc_count}번` : ""}</span>
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
          <div id="chat" className="scroll-mt-6" />
          <Panel title="단체방">
            {!room ? <p className="text-[14px] text-danger">단체방이 없어요.</p> : (
              <ul className="space-y-2 text-[13px]">
                {(msgs ?? []).map((m) => (
                  <li key={m.id} className={`rounded-xl px-3 py-2 ${m.kind === "system" ? "bg-accent-soft/60" : "bg-paper"}`}>
                    <p className="text-[11px] text-muted">{m.kind === "system" ? `자동 게시${CHAT_POST[(m.meta as { type?: string })?.type ?? ""] ? ` · ${CHAT_POST[(m.meta as { type?: string }).type!]}` : ""}` : "참가자"} · {fmtDateTime(m.created_at)}</p>
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
          <Panel title="빈자리 제안 (기다리는 사람에게 자동으로)">
            <ul className="divide-y divide-line text-[13px]">
              {(offers ?? []).map((o) => {
                const x = o as unknown as { id: string; status: string; expires_at: string; users: { name: string } };
                return (
                  <li key={x.id} className="flex items-center justify-between py-2">
                    <span>{x.users.name}</span>
                    <Badge v={OFFER[x.status] ?? ["기타", "muted"]} />
                    <span className="text-muted">{x.status === "pending" ? `${fmtDateTime(x.expires_at)}까지` : ""}</span>
                  </li>
                );
              })}
              {!offers?.length && <li className="py-2 text-muted">빈자리가 생긴 적이 없어요.</li>}
            </ul>
            {active && <p className="mt-2 text-[12px] text-muted">다음 순서 대기자 {waiters.length}명{waiters.length ? `: ${waiters.slice(0, 3).map((w) => w.name).join(", ")}` : ""}</p>}
          </Panel>
          <div id="venue" className="scroll-mt-6">
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
            {t.venues && me.level === "full" && (
              <details className="group mt-4 rounded-xl border border-line open:bg-paper/60">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                  <span className="text-[14px] font-semibold">식당 바꾸기</span>
                  <span className="text-[12px] text-muted group-open:hidden">열기</span>
                </summary>
                <div className="space-y-2.5 px-4 pb-4">
                  {!swap.ok ? <p className="text-[13px] text-muted">{swap.reason}</p> : !swapOptions.length ? (
                    <p className="text-[13px] text-muted">{t.slots.region} 같은 일정에 자리가 남은 다른 식당이 없어요. <Link href="/admin/venues" className="font-semibold text-accent hover:underline">식당 재고</Link>에서 이 일정 테이블 수를 늘려 주세요.</p>
                  ) : (
                    <form action={venueAction} className="space-y-2.5">
                      <input type="hidden" name="table_id" value={t.id} />
                      <select name="venue_id" required className={`${ctl} w-full`}>
                        {swapOptions.map((o) => (
                          <option key={o.venueId} value={o.venueId}>
                            {o.name} · 평점 {o.rating ?? "-"} · {CHANNEL_LABEL[(o.channel ?? "phone") as Channel]} · 남은 {o.left}테이블{o.failedBefore ? " · 예약 안 됐던 곳" : ""}
                          </option>
                        ))}
                      </select>
                      <label className="block">
                        <span className="text-[12px] font-semibold text-ink">사유 <span className="text-danger">(필수)</span></span>
                        <input name="reason" required minLength={4} placeholder="예: 식당 사정으로 그날 영업 안 함" className={`${ctl} mt-1 w-full`} />
                      </label>
                      <p className="text-[12px] text-muted">같은 동네·같은 일정에서 자리가 남은 식당만, 평점 순이에요. 바꾸면 예약을 새로 요청하고, 첫 공지가 나간 테이블이면 단체방과 참가자에게 바로 알려요.</p>
                      <ConfirmButton confirm={`${t.venues.name} 대신 고른 식당으로 바꾸고 예약을 새로 요청해요. 단체방과 참가자에게 바로 알려 되돌릴 수 없어요. 계속할까요?`} className={btnInk}>식당 바꾸기</ConfirmButton>
                    </form>
                  )}
                </div>
              </details>
            )}
          </Panel>
          </div>
          <div id="reservation" className="scroll-mt-6">
          <Panel title="식당 예약">
            {resv ? (
              <div className="space-y-2 text-[14px]">
                <div className="flex items-center gap-2">
                  <Badge v={[{ REQUESTED: "예약 요청 중", CONFIRMED: "예약 확정", FAILED: "예약 실패", CANCELED: "예약 취소" }[resv.status as string] ?? "예약 상태 확인 필요", resv.status === "CONFIRMED" ? "leaf" : resv.status === "FAILED" ? "danger" : "candle"]} />
                  <span className="text-muted">{CHANNEL_LABEL[resv.channel as Channel]} · {resv.party_size}명 · {resv.mode === "mock" ? "시연용 모의 예약" : resv.mode === "manual" ? "운영자 직접 예약" : "예약 서비스 자동 연결"}</span>
                </div>
                {resv.external_ref && <div><span className="text-muted">예약번호 </span><b className="tabular-nums">{resv.external_ref}</b></div>}
                {resv.last_error && <div className="text-danger">마지막 오류: {resv.last_error} (시도 {resv.attempts}회)</div>}
                {resv.deep_link && <a href={resv.deep_link} target="_blank" rel="noreferrer" className="inline-block font-semibold text-accent hover:underline">{CHANNEL_LABEL[resv.channel as Channel]}에서 식당 열기</a>}
                {resv.status !== "CONFIRMED" && me.level === "full" && (
                  <form action={reservationAction} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="table_id" value={t.id} />
                    <input name="ref" placeholder="직접 예약했다면 예약번호" className="h-10 min-w-40 flex-1 rounded-xl border border-line bg-field px-3 text-[13px]" />
                    <SubmitButton name="op" value="manual" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent/40 px-3 text-[13px] font-semibold text-accent">예약 완료로 표시</SubmitButton>
                    <SubmitButton name="op" value="retry" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-[13px] font-semibold text-white">다시 시도</SubmitButton>
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
                  {n.status === "pending" ? <Link href={`/admin/messages/scheduled/${n.id}`} className="min-w-0 truncate text-accent hover:underline">{nameOf.get(n.user_id)} · {n.title}</Link> : <span className="min-w-0 truncate">{nameOf.get(n.user_id)} · {n.title}</span>}
                  <Badge v={n.status === "sent" ? (n.read_at ? ["읽음", "leaf"] : ["보냄", "accent"]) : n.status === "pending" ? [`예약 ${fmtDateTime(n.scheduled_at)}`, "muted"] : n.status === "canceled" ? ["예약 취소", "ink"] : [`실패 ${n.attempts}회`, "danger"]} />
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
                  {reasonText(e.reason) && <span className="block text-[12px] text-muted">{reasonText(e.reason)}</span>}
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
