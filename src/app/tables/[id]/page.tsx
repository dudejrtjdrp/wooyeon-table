import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, ErrorText, LinkButton, Pill, Screen, inputCls } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { checkIn, sendMessage } from "./actions";
import { Refresher } from "./refresher";

export const dynamic = "force-dynamic";

export default async function TablePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { e } = await searchParams;

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

  return (
    <Screen title="우리 테이블" back="/">
      <Refresher />
      <Card className="mt-2">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">{t.rounds.title}</p>
          <Pill tone={t.status === "DONE" ? "muted" : "leaf"}>{t.status === "DONE" ? "모임 끝" : t.status === "IN_PROGRESS" ? "모임 중" : "확정"}</Pill>
        </div>
        <p className="mt-2 text-[20px] font-bold">{fmtDate(t.slots.starts_at)} {fmtTime(t.slots.starts_at)}</p>
        {t.venues ? (
          <div className="mt-3 space-y-1 text-[14px]">
            <p className="text-[16px] font-semibold">{t.venues.name}</p>
            <p className="text-muted">{t.venues.address}</p>
            <p>예약명 <span className="font-medium">{t.reservation_name}</span>{t.venues.price_range ? ` · 1인 ${t.venues.price_range}` : ""}</p>
            {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-block pt-1 underline underline-offset-4">지도에서 보기</a>}
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-muted">{t.slots.region} · 식당을 정하고 있어요</p>
        )}
      </Card>

      {mine && canCheckIn && (
        <form action={checkIn} className="mt-4">
          <input type="hidden" name="table_id" value={id} />
          <button className="w-full rounded-xl bg-accent py-3.5 text-[16px] font-semibold text-white">도착했어요 (체크인)</button>
        </form>
      )}
      {mine?.attendance_status === "ATTENDED" && t.status === "DONE" && (
        <div className="mt-4"><LinkButton href={`/tables/${id}/feedback`}>오늘 모임 후기 남기기</LinkButton></div>
      )}
      <div className="mt-2"><ErrorText msg={e} /></div>

      <section className="mt-6">
        <h2 className="text-[15px] font-semibold">함께하는 분들</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {mems.map((m) => (
            <li key={m.id} className="rounded-full border border-line bg-card px-3 py-1.5 text-[14px]">
              {m.users.name}
              {m.users.profiles?.job && <span className="text-muted"> · {m.users.profiles.job}</span>}
              {m.attendance_status === "ATTENDED" && <span className="ml-1 text-leaf">✓</span>}
            </li>
          ))}
        </ul>
        {t.explanation?.reasons?.length ? (
          <p className="mt-3 text-[14px] leading-relaxed text-muted">이렇게 모였어요: {t.explanation.reasons.join(", ")}</p>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">단체방</h2>
        <div className="mt-3 space-y-3">
          {(msgs ?? []).map((m) =>
            m.kind === "system" ? (
              <div key={m.id} className="whitespace-pre-line rounded-2xl bg-ink/[.04] px-4 py-3 text-[14px] leading-relaxed">
                <p className="mb-1 text-[12px] font-semibold text-accent">우연한 식탁</p>
                {m.body}
              </div>
            ) : (
              <div key={m.id} className={`flex ${m.sender_id === me.id ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[14px] ${m.sender_id === me.id ? "bg-ink text-white" : "border border-line bg-card"}`}>
                  {m.sender_id !== me.id && <p className="text-[12px] font-medium text-muted">{names.get(m.sender_id ?? "") ?? "참가자"}</p>}
                  {m.body}
                </div>
              </div>
            ),
          )}
        </div>
        {mine && t.status !== "DONE" && (
          <form action={sendMessage} className="mt-4 flex gap-2">
            <input type="hidden" name="table_id" value={id} />
            <input name="body" placeholder="메시지 보내기" autoComplete="off" className={inputCls} />
            <button className="shrink-0 rounded-xl bg-ink px-4 text-[15px] font-semibold text-white">보내기</button>
          </form>
        )}
      </section>

      {mine && (
        <p className="mt-10 text-center text-[13px] text-muted">
          불편한 일이 있었나요? <Link href={`/tables/${id}/feedback#report`} className="underline underline-offset-4">신고하기</Link>
        </p>
      )}
    </Screen>
  );
}
