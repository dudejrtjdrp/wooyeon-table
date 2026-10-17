import Link from "next/link";
import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { ErrorText, InfoRows, LinkButton, PrimaryButton, Toast } from "@/components/ui";
import { BackButton, MapButtons } from "@/components/client";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dday, ddayLabel, fmtSlot } from "@/lib/format";
import { mapLinks } from "@/lib/maps";
import { refundCutoff } from "@/lib/policy";
import { CHANNEL_LABEL, type Channel } from "@/lib/reservations";
import { db } from "@/lib/supabase";
import { checkIn, claimAttended } from "./actions";
import { canClaimAttended } from "@/lib/attendance-rules";

export const dynamic = "force-dynamic";

/** E11 매칭 확정: 초록 헤더 + 흰 시트 */
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

  const { data: resv } = await db().from("reservations").select("channel,status,external_ref").eq("table_id", id).maybeSingle();
  const { data: memRaw } = await db()
    .from("applications")
    .select("id,user_id,attendance_status,users(name,profiles(job,gender,birth_year,interests,food_restrictions))")
    .eq("table_id", id)
    .eq("match_status", "CONFIRMED");
  type P = { job: string | null; gender: string; birth_year: number; interests: string[] | null; food_restrictions: string | null };
  const mems = (memRaw ?? []) as unknown as { id: string; user_id: string; attendance_status: string; users: { name: string; profiles: P | null } }[];
  const mine = mems.find((m) => m.user_id === me.id);
  if (!mine && me.role !== "admin") redirect("/");

  const n = await now();
  const start = new Date(t.slots.starts_at);
  const end = new Date(t.slots.ends_at);
  const canCheckIn = mine?.attendance_status === "SCHEDULED" && n >= new Date(start.getTime() - 3600_000) && n <= end;
  // 주소를 누르면 지도 앱이 바로 열리게: 네이버 지도·카카오맵 (앱 없으면 웹 지도)
  const maps = t.venues ? mapLinks(t.venues.name, t.venues.address, t.venues.map_url) : null;
  const done = t.status === "DONE";
  // 갔는데 체크인을 못 한 사람이 끝난 뒤 48시간 안에 알릴 수 있게
  const missedCheckIn = canClaimAttended(mine?.attendance_status, end, n);
  const claimed = missedCheckIn
    ? Boolean((await db().from("status_events").select("id").eq("entity_id", mine!.id).eq("field", "attendance_claim").limit(1)).data?.length)
    : false;

  // 테이블 요약: 성비·나이대·겹치는 관심사
  const ps = mems.map((m) => m.users.profiles).filter((x): x is P => Boolean(x));
  const f = ps.filter((p) => p.gender === "F").length;
  const male = ps.filter((p) => p.gender === "M").length;
  const age = (by: number) => n.getFullYear() - by + 1;
  const ages = ps.map((p) => age(p.birth_year));
  const tally = new Map<string, number>();
  for (const p of ps) for (const x of p.interests ?? []) tally.set(x, (tally.get(x) ?? 0) + 1);
  const shared = [...tally.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([x]) => x);
  const myFood = mine?.users.profiles?.food_restrictions;
  const twoDays = n >= refundCutoff(t.slots.starts_at);

  const status = done ? "모임 끝" : t.status === "IN_PROGRESS" ? "모임 중" : "매칭 확정";
  const title = done ? "오늘 저녁 어땠어요?" : t.status === "IN_PROGRESS" ? "지금 모임 중이에요" : "테이블이 정해졌어요";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-navy">
      <Toast msg={toast} />
      <header className="pt-safe px-3 text-white">
        <div className="flex h-12 items-center [&_button]:text-white"><BackButton href="/my-tables" /></div>
        <div className="px-3 pb-7">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-[14px] bg-accent2 px-2.5 text-[13px] font-bold text-[#ddf0e5]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {status}{!done && ` · ${ddayLabel(dday(t.slots.starts_at, n))}`}
          </span>
          <h1 className="mt-3.5 text-[28px] font-black leading-[1.36]">{title}</h1>
          <p className="mt-2 text-[16px] text-on-accent">{fmtSlot(t.slots.starts_at)} · {t.slots.region}</p>
        </div>
      </header>

      <main className="flex-1 rounded-t-[28px] bg-paper px-6 pb-36 pt-7">
        <div className="flex items-center gap-4">
          <RoundTable size={112} filled={Math.min(6, mems.length)} seats={Math.max(mems.length, 4)} label={`${mems.length}자리가 찬 테이블`} />
          <div className="flex flex-col gap-1.5">
            <p className="text-[20px] font-black">{mems.length}명이 함께 앉아요</p>
            <p className="text-[14px] leading-[1.55] text-[#4a5a51]">
              여 {f} · 남 {male}
              <br />
              {ages.length ? `${Math.min(...ages)}~${Math.max(...ages)}살` : ""} · 서로 처음 봐요
            </p>
          </div>
        </div>

        {shared.length > 0 && (
          <section className="mt-[22px] rounded-[16px] bg-field px-[18px] py-4" aria-label="이 테이블이 겹치는 것">
            <p className="text-[13px] text-muted">이 테이블이 겹치는 것</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {shared.map((x) => (
                <li key={x} className="flex min-h-[30px] items-center rounded-[15px] bg-paper px-3 text-[14px] font-bold">{x}</li>
              ))}
            </ul>
          </section>
        )}

        {(t.explanation?.reasons?.length ?? 0) > 0 && (
          <section className="mt-3.5" aria-label="이렇게 모였어요">
            <p className="text-[14px] font-extrabold text-ink2">이렇게 모였어요</p>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-[1.6] text-ink2">
              {t.explanation!.reasons!.map((r) => (
                <li key={r} className="flex gap-2"><span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-3.5">
          <InfoRows
            rows={[
              ["식당", t.venues ? t.venues.name : "정하고 있어요"],
              ...(t.venues ? ([["주소", t.venues.address]] as [string, string][]) : []),
              ...(t.reservation_name ? ([["예약 이름", t.reservation_name]] as [string, string][]) : []),
              ...(resv ? ([["예약", resv.status === "CONFIRMED" ? <span key="r">{CHANNEL_LABEL[resv.channel as Channel]} 예약 확정{resv.external_ref ? ` · ${resv.external_ref}` : ""}</span> : "운영팀이 예약하고 있어요"]] as [string, React.ReactNode][]) : []),
              ...(t.venues?.price_range ? ([["1인 가격대", t.venues.price_range]] as [string, string][]) : []),
              ["못 드시는 음식", myFood ? `${myFood}` : "없어요"],
            ]}
          />
          {maps && <MapButtons links={maps} />}
          {myFood && <p className="mt-2 text-[12px] text-faint">식당을 정할 때 운영팀이 참고해요.</p>}
        </div>

        <section className="mt-6" aria-label="함께하는 사람">
          <p className="text-[14px] font-extrabold text-ink2">함께하는 사람</p>
          <ul className="mt-2 divide-y divide-line2">
            {mems.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-[15px]">
                <span className="font-bold">{m.users.name}{m.user_id === me.id && <span className="ml-1.5 text-[12px] font-bold text-accent">나</span>}</span>
                <span className="flex items-center gap-2 text-muted">
                  {m.users.profiles?.job}
                  {m.attendance_status === "ATTENDED" && <span className="text-[12px] font-bold text-accent">도착</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-faint">이름과 하는 일만 보여요. 연락처는 공개되지 않아요.</p>
        </section>

        <div className="mt-4"><ErrorText msg={e} /></div>
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
        <div className="pb-4">
          {mine && canCheckIn ? (
            <form action={checkIn}>
              <input type="hidden" name="table_id" value={id} />
              <PrimaryButton pendingText="체크인하는 중">도착했어요, 체크인</PrimaryButton>
            </form>
          ) : mine?.attendance_status === "ATTENDED" && done ? (
            <LinkButton href={`/tables/${id}/feedback`}>오늘 모임 후기 남기기</LinkButton>
          ) : missedCheckIn ? (
            <>
              <p className="mb-3 text-center text-[13px] leading-relaxed text-muted">
                {claimed
                  ? "알려 주신 내용을 운영팀이 확인하고 있어요. 참석으로 바뀌면 후기를 남길 수 있어요."
                  : "체크인 기록이 없어 지금은 노쇼 후보로 올라가 있어요. 참석했다면 알려 주세요. 운영팀이 확인하면 참석으로 바뀌고 후기를 남길 수 있어요."}
              </p>
              {claimed ? (
                <LinkButton href={`/tables/${id}/chat`}>단체방 다시 보기</LinkButton>
              ) : (
                <form action={claimAttended}>
                  <input type="hidden" name="table_id" value={id} />
                  <PrimaryButton pendingText="알리는 중">참석했는데 체크인을 못 했어요</PrimaryButton>
                </form>
              )}
            </>
          ) : (
            <>
              {!done && (
                <p className="mb-3 text-center text-[13px] leading-relaxed text-muted">
                  하루 전에 한 번 더 알려드릴게요. {twoDays ? "환불 마감(모임 주 화요일 밤 12시)이 지나 지금 취소하면 환불이 안 돼요." : "모임 주 화요일 밤 12시까지는 취소하면 환불돼요."} 당일 취소는 안 되고, 연락 없이 오지 않으면 노쇼로 기록돼요.
                  {mine?.attendance_status === "ATTENDED" && " 체크인했어요."}
                </p>
              )}
              <LinkButton href={`/tables/${id}/chat`}>{done ? "단체방 다시 보기" : "단체방 들어가기"}</LinkButton>
            </>
          )}
          {mine && canCheckIn && <p className="mt-2 text-center text-[13px]"><Link href={`/tables/${id}/chat`} className="inline-flex h-11 items-center font-bold text-accent">단체방 들어가기</Link></p>}
        </div>
      </div>
    </div>
  );
}
