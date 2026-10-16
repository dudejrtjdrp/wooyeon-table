import Link from "next/link";
import { redirect } from "next/navigation";
import { TableMark } from "@/components/brand";
import { ErrorText, Screen, Toast } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtClock, fmtDay } from "@/lib/format";
import { refundCutoff } from "@/lib/policy";
import { db } from "@/lib/supabase";
import { lateNotice, sendMessage } from "../actions";
import { Composer } from "../composer";
import { Refresher } from "../refresher";

export const dynamic = "force-dynamic";

/** 단체방: 우연한 식탁이 올리는 안내·대화 질문 카드와 참가자 대화 */
export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { e, m: toast } = await searchParams;

  const { data: raw } = await db().from("dining_tables").select("id,status,slots(region,starts_at,ends_at),venues(name)").eq("id", id).maybeSingle();
  const t = raw as unknown as { id: string; status: string; slots: { region: string; starts_at: string; ends_at: string }; venues: { name: string } | null } | null;
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
  const sameDay = fmtDay(n.toISOString()) === fmtDay(t.slots.starts_at);
  const timeOf = fmtClock;
  const chatOpen = Boolean(mine) && t.status !== "DONE";
  const dayOf = (iso: string) => fmtDay(iso).replace(/\((.)\)$/, " $1요일");
  let lastDay = "";

  return (
    <Screen title={`${fmtDay(t.slots.starts_at)} ${t.slots.region} 테이블 · ${mems.length}명`} back={`/tables/${id}`}>
      <Refresher tableId={id} />
      <Toast msg={toast} />
      <Link href={`/tables/${id}`} className="mt-1 flex items-center gap-3 rounded-[16px] bg-field px-[14px] py-3">
        <span className="min-w-0 flex-1 text-[13px] leading-[1.45] text-ink2">
          <b className="text-ink">{fmtClock(t.slots.starts_at)}{t.venues ? ` · ${t.venues.name}` : ""}</b>
          <br />
          {t.status === "DONE" ? "모임이 끝났어요. 모임 정보에서 후기를 남길 수 있어요." : sameDay ? "오늘은 취소와 단체방 나가기가 안 돼요." : n >= refundCutoff(t.slots.starts_at) ? "환불 마감이 지나 지금 취소하면 환불이 안 돼요." : "모임 주 화요일 밤 12시까지는 취소하면 전액 환불돼요."}
        </span>
        <span className="flex h-11 shrink-0 items-center text-[13px] font-bold text-accent">모임 정보</span>
      </Link>
      <div className="mt-2"><ErrorText msg={e} /></div>
      <section className={`mt-3 ${chatOpen ? "pb-24" : ""}`}>
        <div className="mt-2 space-y-3">
          {(msgs ?? []).map((m) => {
            const day = dayOf(m.created_at);
            const sep = day !== lastDay ? ((lastDay = day), <p key={`d${m.id}`} className="mx-auto w-fit rounded-[12px] bg-field px-3 py-1 text-[12px] font-bold text-muted">{day}</p>) : null;
            const [first, ...rest] = m.body.split("\n");
            const node =
              m.kind === "system" ? (
                <div key={m.id} className="flex gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent" aria-hidden="true"><TableMark size={22} tone="white" /></span>
                  <div className="min-w-0 max-w-[300px] flex-1 overflow-hidden rounded-[6px_20px_20px_20px] bg-field">
                    <div className="bg-accent px-[18px] py-4 text-white">
                      <p className="text-[12px] font-bold text-on-accent">우연한 식탁</p>
                      <p className="mt-1.5 text-[17px] font-extrabold leading-[1.45]">{first}</p>
                    </div>
                    {rest.length > 0 && <p className="whitespace-pre-line px-[14px] py-3 text-[14px] leading-relaxed text-ink2">{rest.join("\n").trim()}</p>}
                    <p className="px-[14px] pb-2 text-right text-[11px] text-faint">{timeOf(m.created_at)}</p>
                  </div>
                </div>
              ) : m.sender_id === me.id ? (
                <div key={m.id} className="flex items-end justify-end gap-1.5">
                  <span className="text-[12px] text-muted">{timeOf(m.created_at)}</span>
                  <p className="max-w-[75%] whitespace-pre-line rounded-[18px_6px_18px_18px] bg-accent px-[14px] py-2.5 text-[15px] text-white">{m.body}</p>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2.5">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-extrabold text-white ${AVATAR[Math.max(0, mems.findIndex((x) => x.user_id === m.sender_id)) % AVATAR.length]}`}>{(names.get(m.sender_id ?? "") ?? "참").slice(-2, -1) || "참"}</span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[13px] text-muted">{names.get(m.sender_id ?? "") ?? "참가자"}{jobs.get(m.sender_id ?? "") ? ` · ${jobs.get(m.sender_id ?? "")}` : ""}</p>
                    <div className="flex items-end gap-1.5">
                      <p className="max-w-[70vw] whitespace-pre-line rounded-[6px_18px_18px_18px] bg-field px-[14px] py-2.5 text-[15px] text-ink sm:max-w-[260px]">{m.body}</p>
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
          <p className="mt-8 text-center text-[13px] text-muted">
            불편한 일이 있었나요? <Link href={`/tables/${id}/feedback#report`} className="inline-flex h-11 items-center font-bold text-accent underline underline-offset-4">신고하기</Link>
          </p>
        )}
        {mine?.attendance_status === "SCHEDULED" && t.status !== "DONE" && (
          <p className="mt-1 text-center text-[13px]"><Link href={`/applications/${mine.id}`} className="inline-flex h-11 items-center text-muted underline underline-offset-4">참석 취소·환불 규정</Link></p>
        )}
      </section>
      {chatOpen && <Composer tableId={id} action={sendMessage} lateAction={sameDay && mine?.attendance_status === "SCHEDULED" ? lateNotice : undefined} />}
    </Screen>
  );
}

const AVATAR = ["bg-[#e07a5f]", "bg-[#3d5a80]", "bg-[#81b29a]", "bg-[#9c6644]", "bg-[#2a7357]", "bg-[#b5838d]"];
