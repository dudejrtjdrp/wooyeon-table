import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, MapPin, Navigation, Receipt } from "lucide-react";
import { TableMark } from "@/components/brand";
import { ErrorText, LinkButton, Pill, PrimaryButton, Screen, Toast } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
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

  const n = await now();
  const start = new Date(t.slots.starts_at);
  const end = new Date(t.slots.ends_at);
  const canCheckIn = mine?.attendance_status === "SCHEDULED" && n >= new Date(start.getTime() - 3600_000) && n <= end;
  const mapUrl = t.venues ? t.venues.map_url ?? `https://map.naver.com/p/search/${encodeURIComponent(t.venues.address)}` : null;

  const timeOf = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const chatOpen = Boolean(mine) && t.status !== "DONE";

  return (
    <Screen title={`${fmtDate(t.slots.starts_at)} ${t.slots.region}`} back="/my-tables">
      <Refresher tableId={id} />
      <Toast msg={toast} />
      <section className="mt-2 rounded-3xl bg-ink p-5 text-white">
        <div className="flex items-start justify-between">
          <TableMark size={44} tone="white" seats={Math.max(mems.length, 4)} filled={mems.filter((m) => m.attendance_status === "ATTENDED").length || mems.length} glow={t.status !== "DONE"} />
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">
            {t.status === "DONE" ? "모임 끝" : t.status === "IN_PROGRESS" ? "모임 중" : "확정"}
          </span>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-[20px] font-bold tracking-[-0.02em]">
          {fmtDate(t.slots.starts_at)} {fmtTime(t.slots.starts_at)}
        </p>
        {t.venues ? (
          <div className="mt-3 space-y-2 text-[14px]">
            <p className="flex items-center gap-2 text-[16px] font-semibold"><MapPin size={16} className="text-candle" />{t.venues.name}</p>
            <p className="pl-6 text-white/70">{t.venues.address}</p>
            <p className="flex items-center gap-2 text-white/90"><Receipt size={16} className="text-candle" />예약명 {t.reservation_name}{t.venues.price_range ? `, 1인 ${t.venues.price_range}` : ""}</p>
            <p className="flex items-center gap-2 text-white/90"><Clock size={16} className="text-candle" />{fmtTime(t.slots.starts_at)}부터 {fmtTime(t.slots.ends_at)}까지</p>
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-white/70">{t.slots.region}, 식당을 정하고 있어요</p>
        )}
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-white/12 text-[14px] font-semibold">
            <Navigation size={16} /> 길찾기
          </a>
        )}
      </section>

      {mine && canCheckIn && (
        <form action={checkIn} className="mt-3">
          <input type="hidden" name="table_id" value={id} />
          <PrimaryButton pendingText="체크인하는 중">도착했어요, 체크인</PrimaryButton>
        </form>
      )}
      {mine?.attendance_status === "ATTENDED" && t.status === "DONE" && (
        <div className="mt-3"><LinkButton href={`/tables/${id}/feedback`}>오늘 모임 후기 남기기</LinkButton></div>
      )}
      <div className="mt-2"><ErrorText msg={e} /></div>

      <section className="mt-6">
        <p className="text-[15px] font-bold">함께하는 {mems.length}명</p>
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {mems.map((m) => (
            <li key={m.id} className="flex w-16 shrink-0 flex-col items-center text-center">
              <span className={`relative flex size-12 items-center justify-center rounded-full text-[16px] font-bold ${m.user_id === me.id ? "bg-accent text-white" : "bg-card text-ink"}`}>
                {m.users.name.slice(0, 1)}
                {m.attendance_status === "ATTENDED" && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-paper bg-leaf" />}
              </span>
              <span className="mt-1.5 w-full truncate text-[13px] font-medium">{m.users.name}</span>
              {m.users.profiles?.job && <span className="w-full truncate text-[11px] text-muted">{m.users.profiles.job}</span>}
            </li>
          ))}
        </ul>
        {t.explanation?.reasons?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.explanation.reasons.map((r) => <Pill key={r} tone="accent">{r}</Pill>)}
          </div>
        ) : null}
      </section>

      <section className={`mt-8 ${chatOpen ? "pb-20" : ""}`}>
        <p className="text-[15px] font-bold">단체방</p>
        <div className="mt-3 space-y-2.5">
          {(msgs ?? []).map((m) =>
            m.kind === "system" ? (
              <div key={m.id} className="whitespace-pre-line rounded-3xl bg-card px-4 py-3.5 text-[14px] leading-relaxed">
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-accent"><TableMark size={16} />우연한 식탁</p>
                {m.body}
              </div>
            ) : m.sender_id === me.id ? (
              <div key={m.id} className="flex items-end justify-end gap-1.5">
                <span className="text-[11px] text-muted">{timeOf(m.created_at)}</span>
                <p className="max-w-[75%] whitespace-pre-line rounded-[20px] rounded-br-md bg-accent px-3.5 py-2.5 text-[15px] text-white">{m.body}</p>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-[13px] font-bold">{(names.get(m.sender_id ?? "") ?? "참").slice(0, 1)}</span>
                <div className="min-w-0">
                  <p className="mb-1 text-[12px] font-medium text-muted">{names.get(m.sender_id ?? "") ?? "참가자"}</p>
                  <div className="flex items-end gap-1.5">
                    <p className="max-w-[75vw] whitespace-pre-line rounded-[20px] rounded-tl-md bg-card px-3.5 py-2.5 text-[15px] sm:max-w-[280px]">{m.body}</p>
                    <span className="shrink-0 text-[11px] text-muted">{timeOf(m.created_at)}</span>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
        {!chatOpen && mine && <p className="mt-4 text-center text-[13px] text-muted">모임이 끝나 단체방이 닫혔어요.</p>}
      </section>

      {mine && (
        <p className={`mt-8 text-center text-[13px] text-muted ${chatOpen ? "mb-16" : ""}`}>
          불편한 일이 있었나요? <Link href={`/tables/${id}/feedback#report`} className="font-medium underline underline-offset-4">신고하기</Link>
          {mine.attendance_status === "SCHEDULED" && t.status !== "DONE" && (
            <>
              <span className="mx-2 text-line">|</span>
              <Link href={`/applications/${mine.id}`} className="font-medium underline underline-offset-4">참석 취소·환불 규정</Link>
            </>
          )}
        </p>
      )}
      {chatOpen && <Composer tableId={id} action={sendMessage} />}
    </Screen>
  );
}
