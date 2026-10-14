import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUp, CalendarDays, ChevronRight, CircleCheck, CircleDollarSign, Clock, MapPin, MessagesSquare, Sprout, Users, UtensilsCrossed } from "lucide-react";
import { ErrorText, IMG, LinkButton, Photo, Pill, PrimaryButton, Screen, SectionTitle, Toast } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtClock, fmtDay, fmtSlot } from "@/lib/format";
import { db } from "@/lib/supabase";
import { checkIn, sendMessage } from "./actions";
import { Composer } from "./composer";
import { Refresher } from "./refresher";

export const dynamic = "force-dynamic";

export default async function TablePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { e, m: toast } = await searchParams;

  const { data: raw } = await db()
    .from("dining_tables")
    .select("id,status,reservation_name,explanation,slots(region,starts_at,ends_at),venues(name,address,map_url,price_range),rounds(title)")
    .eq("id", id)
    .maybeSingle();
  const t = raw as unknown as {
    id: string; status: string; reservation_name: string | null; explanation: { reasons?: string[] };
    slots: { region: string; starts_at: string; ends_at: string };
    venues: { name: string; address: string; map_url: string | null; price_range: string | null } | null;
    rounds: { title: string };
  } | null;
  if (!t) redirect("/");

  const { data: memRaw } = await db()
    .from("applications")
    .select("id,user_id,attendance_status,users(name,profiles(job))")
    .eq("table_id", id)
    .eq("match_status", "CONFIRMED");
  const mems = (memRaw ?? []) as unknown as { id: string; user_id: string; attendance_status: string; users: { name: string; profiles: { job: string | null } | null } }[];
  const mine = mems.find((m) => m.user_id === me.id);
  if (!mine && me.role !== "admin") redirect("/");

  const { data: room } = await db().from("chat_rooms").select("id").eq("table_id", id).maybeSingle();
  const { data: msgs } = room
    ? await db().from("chat_messages").select("id,kind,body,sender_id,created_at").eq("room_id", room.id).order("created_at")
    : { data: [] };
  const names = new Map(mems.map((m) => [m.user_id, m.users.name]));
  const jobs = new Map(mems.map((m) => [m.user_id, m.users.profiles?.job ?? ""]));

  const n = await now();
  const start = new Date(t.slots.starts_at);
  const end = new Date(t.slots.ends_at);
  const canCheckIn = mine?.attendance_status === "SCHEDULED" && n >= new Date(start.getTime() - 3600_000) && n <= end;
  const mapUrl = t.venues ? t.venues.map_url ?? `https://map.naver.com/p/search/${encodeURIComponent(t.venues.address)}` : null;

  const timeOf = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const chatOpen = Boolean(mine) && t.status !== "DONE";

  const status = t.status === "DONE" ? ["모임 끝", "muted"] : t.status === "IN_PROGRESS" ? ["모임 중", "accent"] : ["매칭 확정", "accent"];
  const REASON_ICON = [Users, Sprout, MessagesSquare];
  const REASON_TONE = ["bg-accent-soft text-accent", "bg-leaf/10 text-leaf", "bg-[#f0ecfd] text-[#6a4fd6]"];
  const dayOf = (iso: string) => fmtDay(iso).replace(/\((.)\)$/, " $1요일");
  let lastDay = "";

  return (
    <Screen title={`${fmtDay(t.slots.starts_at)} ${t.slots.region}`} back="/my-tables">
      <Refresher tableId={id} />
      <Toast msg={toast} />
      <section id="info" className="shadow-card mt-2 scroll-mt-16 overflow-hidden rounded-[24px] bg-card">
        <Photo src={IMG.tableRestaurant} className="h-[170px]" position="center 55%" priority />
        <div className="p-5">
          <Pill tone={status[1] as "muted" | "accent"}>{status[0]}</Pill>
          <p className="mt-3 text-[26px] font-bold tracking-[-0.03em] text-ink">{fmtSlot(t.slots.starts_at)}</p>
          {t.venues ? (
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[21px] font-bold text-ink">{t.venues.name}</p>
                <p className="mt-1 text-[15px] text-muted">{t.venues.address}</p>
              </div>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] border-accent/60 px-3.5 text-[15px] font-semibold text-accent">
                  <MapPin size={17} /> 길찾기
                </a>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[15px] text-muted">{t.slots.region}, 식당을 정하고 있어요</p>
          )}
          {t.venues && (
            <ul className="mt-5 space-y-3 border-t border-dashed border-line pt-5 text-[15px]">
              <li className="flex items-center gap-3 text-ink"><CalendarDays size={20} className="text-muted" /><span className="text-muted">예약명</span>·<span>{t.reservation_name}</span></li>
              {t.venues.price_range && <li className="flex items-center gap-3 text-ink"><CircleDollarSign size={20} className="text-muted" /><span className="text-muted">1인 가격대</span>·<span>{t.venues.price_range}</span></li>}
              <li className="flex items-center gap-3 text-ink"><Clock size={20} className="text-muted" /><span className="text-muted">모임 시간</span>·<span>{fmtHM(t.slots.starts_at)} ~ {fmtHM(t.slots.ends_at)}</span></li>
            </ul>
          )}
          {mine && canCheckIn && (
            <form action={checkIn} className="mt-6 border-t border-line pt-5">
              <input type="hidden" name="table_id" value={id} />
              <PrimaryButton pendingText="체크인하는 중">도착했어요, 체크인 <ChevronRight size={20} /></PrimaryButton>
              <p className="mt-2.5 text-center text-[13px] text-muted">시작 1시간 전부터 체크인할 수 있어요.</p>
            </form>
          )}
          {mine?.attendance_status === "SCHEDULED" && !canCheckIn && t.status !== "DONE" && (
            <p className="mt-5 rounded-2xl bg-field px-4 py-3 text-center text-[13px] text-muted">모임 시작 1시간 전부터 이 화면에서 체크인할 수 있어요.</p>
          )}
          {mine?.attendance_status === "ATTENDED" && t.status !== "DONE" && (
            <p className="mt-5 flex items-center justify-center gap-1.5 rounded-2xl bg-leaf/10 px-4 py-3 text-[14px] font-semibold text-leaf"><CircleCheck size={18} />체크인했어요. 즐거운 저녁 되세요!</p>
          )}
          {mine?.attendance_status === "ATTENDED" && t.status === "DONE" && (
            <div className="mt-5"><LinkButton href={`/tables/${id}/feedback`}>오늘 모임 후기 남기기 <ChevronRight size={20} /></LinkButton></div>
          )}
        </div>
      </section>
      <div className="mt-2"><ErrorText msg={e} /></div>

      <SectionTitle>함께하는 {mems.length}명</SectionTitle>
      <ul className="flex gap-1 overflow-x-auto pb-1">
        {mems.map((m, i) => (
          <li key={m.id} className="flex w-[62px] shrink-0 flex-col items-center text-center">
            <span className={`relative flex size-[54px] items-center justify-center rounded-full text-[20px] font-bold ${m.user_id === me.id ? "bg-accent text-white" : AVATAR[i % AVATAR.length]}`}>
              {m.users.name.slice(-2, -1) || m.users.name.slice(0, 1)}
              {m.attendance_status === "ATTENDED" && <span className="absolute right-0 top-0 size-3.5 rounded-full border-2 border-paper bg-leaf" />}
            </span>
            <span className="mt-2 w-full truncate text-[14px] font-semibold text-ink">{m.users.name}</span>
            {m.users.profiles?.job && <span className="w-full truncate text-[12px] text-muted">{m.users.profiles.job}</span>}
          </li>
        ))}
      </ul>
      {t.explanation?.reasons?.length ? (
        <section className="shadow-card mt-4 rounded-[22px] bg-card p-5">
          <p className="text-[18px] font-bold text-ink">이렇게 모였어요</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {t.explanation.reasons.map((r, i) => {
              const I = REASON_ICON[i % 3];
              return <span key={r} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold ${REASON_TONE[i % 3]}`}><I size={16} />{r}</span>;
            })}
          </div>
        </section>
      ) : null}

      <section className={`mt-4 ${chatOpen ? "pb-24" : ""}`}>
        <div className="shadow-card sticky top-[calc(env(safe-area-inset-top)+56px)] z-10 flex items-center gap-3 rounded-[20px] bg-card/95 p-3 backdrop-blur">
          <Photo src={IMG.tableRestaurant} className="size-14 shrink-0 rounded-xl" sizes="64px" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-ink">{fmtClock(t.slots.starts_at)}{t.venues ? ` · ${t.venues.name}` : ""}</p>
            <p className="truncate text-[13px] text-muted">{t.venues ? `${t.venues.address}${t.venues.price_range ? ` | ${t.venues.price_range}` : ""}` : t.slots.region}</p>
          </div>
          <a href="#info" className="flex shrink-0 items-center gap-0.5 text-[14px] font-semibold text-accent">모임 정보 <ArrowUp size={16} /></a>
        </div>
        <h2 className="mt-6 text-[24px] font-bold tracking-[-0.03em] text-ink">단체방</h2>
        <div className="mt-4 space-y-3">
          {(msgs ?? []).map((m) => {
            const day = dayOf(m.created_at);
            const sep = day !== lastDay ? ((lastDay = day), <p key={`d${m.id}`} className="mx-auto w-fit rounded-full bg-accent-soft px-4 py-1.5 text-[13px] font-semibold text-accent">{day}</p>) : null;
            const [first, ...rest] = m.body.split("\n");
            const node =
              m.kind === "system" ? (
                <div key={m.id} className="flex gap-3 rounded-[20px] bg-accent-soft/60 p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-accent"><UtensilsCrossed size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-muted">우연한 식탁</p>
                    <p className="mt-1 text-[16px] font-bold text-ink">{first}</p>
                    {rest.length > 0 && <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#4c5368]">{rest.join("\n").trim()}</p>}
                    <p className="mt-1 text-right text-[12px] text-muted">{timeOf(m.created_at)}</p>
                  </div>
                </div>
              ) : m.sender_id === me.id ? (
                <div key={m.id} className="flex items-end justify-end gap-1.5">
                  <span className="text-[12px] text-muted">{timeOf(m.created_at)}</span>
                  <p className="max-w-[75%] whitespace-pre-line rounded-[20px] rounded-br-md bg-accent px-4 py-3 text-[16px] text-white">{m.body}</p>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2.5">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${AVATAR[Math.max(0, mems.findIndex((x) => x.user_id === m.sender_id)) % AVATAR.length]}`}>{(names.get(m.sender_id ?? "") ?? "참").slice(-2, -1) || "참"}</span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[13px] text-muted">{names.get(m.sender_id ?? "") ?? "참가자"}{jobs.get(m.sender_id ?? "") ? ` · ${jobs.get(m.sender_id ?? "")}` : ""}</p>
                    <div className="flex items-end gap-1.5">
                      <p className="shadow-card max-w-[70vw] whitespace-pre-line rounded-[20px] rounded-tl-md bg-card px-4 py-3 text-[16px] text-ink sm:max-w-[280px]">{m.body}</p>
                      <span className="shrink-0 text-[12px] text-muted">{timeOf(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            return sep ? [sep, node] : node;
          })}
        </div>
        {!chatOpen && mine && <p className="mt-4 text-center text-[13px] text-muted">모임이 끝나 단체방이 닫혔어요.</p>}

        {mine && (
          <div className="mt-8 flex items-center gap-3 text-[14px] text-muted">
            <span className="h-px flex-1 bg-line" />
            <span>불편한 일이 있었나요? <Link href={`/tables/${id}/feedback#report`} className="font-semibold text-accent">신고하기 <ChevronRight size={14} className="inline" /></Link></span>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
        {mine?.attendance_status === "SCHEDULED" && t.status !== "DONE" && (
          <p className="mt-3 text-center text-[13px]"><Link href={`/applications/${mine.id}`} className="text-muted underline underline-offset-4">참석 취소·환불 규정</Link></p>
        )}
      </section>
      {chatOpen && <Composer tableId={id} action={sendMessage} />}
    </Screen>
  );
}

const AVATAR = ["bg-accent-soft text-accent", "bg-[#e6f6ee] text-[#16a06b]", "bg-[#fdecee] text-[#e2556b]", "bg-[#f0ecfd] text-[#6a4fd6]", "bg-[#fdf3e3] text-[#c2780e]", "bg-[#e5f3fb] text-[#2a8fc4]"];
const fmtHM = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
