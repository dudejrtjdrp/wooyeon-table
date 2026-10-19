import Link from "next/link";
import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { ChevronRight } from "lucide-react";
import { ErrorText, LinkButton, PrimaryButton, Toast } from "@/components/ui";
import { BackButton, MapButtons } from "@/components/client";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dday, ddayLabel, fmtDay, fmtDayClock, fmtSlot } from "@/lib/format";
import { mapLinks } from "@/lib/maps";
import { refundCutoff } from "@/lib/policy";
import { CHANNEL_LABEL, type Channel } from "@/lib/reservations";
import { db } from "@/lib/supabase";
import { checkIn, claimAttended } from "./actions";
import { canClaimAttended } from "@/lib/attendance-rules";
import { after } from "next/server";
import { maybeTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/** E11 매칭 확정: 초록 헤더 + 흰 시트 */
export default async function TablePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const me = await requireMe();
  // 예약 실행(GitHub Actions)이 몇 시간씩 밀릴 때가 있어, 모임 화면을 열 때도 밀린 일(시작 콘텐츠·체크인 안내·리마인드)을 돌린다
  after(() => maybeTick().catch(() => null));
  const { id } = await params;
  const { e, m: toast } = await searchParams;

  const { data: raw } = await db()
    .from("dining_tables")
    .select("id,status,reservation_name,explanation,slots(region,starts_at,ends_at),venues(name,address,map_url,price_range,rating,review_count,photo_url,category),rounds(title)")
    .eq("id", id)
    .maybeSingle();
  const t = raw as unknown as {
    id: string; status: string; reservation_name: string | null; explanation: { reasons?: string[] };
    slots: { region: string; starts_at: string; ends_at: string };
    venues: { name: string; address: string; map_url: string | null; price_range: string | null; rating: number | null; review_count: number | null; photo_url: string | null; category: string | null } | null;
    rounds: { title: string };
  } | null;
  if (!t) redirect(`/?m=${encodeURIComponent("이 모임을 찾지 못했어요. 내 모임은 단체방 탭에서 볼 수 있어요")}`);

  const { data: resv } = await db().from("reservations").select("channel,status,external_ref").eq("table_id", id).maybeSingle();
  const { data: memRaw } = await db()
    .from("applications")
    .select("id,user_id,attendance_status,users(name,profiles(job,gender,birth_year,interests,food_restrictions))")
    .eq("table_id", id)
    .eq("match_status", "CONFIRMED");
  type P = { job: string | null; gender: string; birth_year: number; interests: string[] | null; food_restrictions: string | null };
  const mems = (memRaw ?? []) as unknown as { id: string; user_id: string; attendance_status: string; users: { name: string; profiles: P | null } }[];
  const mine = mems.find((m) => m.user_id === me.id);
  if (!mine && me.role !== "admin") redirect(`/?m=${encodeURIComponent("함께하는 모임만 열 수 있어요")}`);

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
  const others = mems.filter((m) => m.user_id !== me.id);
  const preview = others.slice(0, 2);
  const interestsOf = (m: (typeof mems)[number]) => (m.users.profiles?.interests ?? []).filter((x) => shared.includes(x)).slice(0, 2);
  const cutoff = refundCutoff(t.slots.starts_at);
  const dayBefore = new Date(start.getTime() - 24 * 3600_000);
  const timeline: [Date, string, string][] = [
    [cutoff, fmtSlot(cutoff.toISOString()), twoDays ? "환불 마감이 지났어요" : "여기까지 취소하면 전액 환불"],
    [dayBefore, fmtDay(dayBefore.toISOString()), "하루 전 안내 알림"],
    [start, fmtSlot(t.slots.starts_at), mine?.attendance_status === "ATTENDED" ? "체크인했어요" : "도착하면 체크인 (1시간 전부터)"],
  ];
  const [dayLabel, clock] = fmtDayClock(t.slots.starts_at);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <Toast msg={toast} />
      {/* 위 색면: 사진 대신 식탁 그림. 뒤로 가기는 떠 있는 동그라미 */}
      <header className={`pt-safe relative overflow-hidden bg-[#ebe0d1] ${t.venues?.photo_url ? "h-[260px]" : "h-[210px]"}`}>
        <div className="relative z-10 flex h-14 items-center px-3"><span className="flex size-11 items-center justify-center rounded-full bg-card"><BackButton href="/my-tables" /></span></div>
        {t.venues?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.venues.photo_url} alt={`${t.venues.name} 사진`} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="pointer-events-none absolute -bottom-12 -right-6" aria-hidden="true">
            <RoundTable size={230} filled={Math.min(6, mems.length)} seats={Math.max(mems.length, 4)} />
          </div>
        )}
      </header>

      <main className="relative -mt-6 flex-1 rounded-t-[24px] bg-paper px-5 pb-40 pt-6">
        <span className="inline-flex h-7 items-center rounded-full bg-leaf-soft px-3 text-[13px] font-semibold text-leaf">{status}{!done && ` · ${ddayLabel(dday(t.slots.starts_at, n))}`}</span>
        <h1 className="mt-3 text-[24px] font-bold leading-snug">{t.venues ? t.venues.name : "식당을 정하고 있어요"}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {[t.venues?.category, t.venues?.rating ? `평점 ${t.venues.rating}${t.venues.review_count ? ` · 리뷰 ${t.venues.review_count}` : ""}` : null].filter(Boolean).join(" · ") || t.rounds.title}
        </p>

        <section className="mt-5 grid grid-cols-3 rounded-[18px] bg-card" aria-label="핵심 정보">
          {[
            ["일시", dayLabel, clock],
            ["동네", t.slots.region.split("·")[0], t.slots.region.split("·").slice(1).join("·") || " "],
            ["인원", `${mems.length}명`, ages.length ? `${Math.min(...ages)}~${Math.max(...ages)}살 · 여${f} 남${male}` : " "],
          ].map(([k, a, b], i) => (
            <div key={k} className={`flex flex-col items-center gap-0.5 px-2 py-4 text-center ${i < 2 ? "border-r border-line2" : ""}`}>
              <span className="text-[12px] text-muted">{k}</span>
              <span className="text-[15px] font-bold">{a}</span>
              <span className="text-[12px] leading-tight text-muted">{b}</span>
            </div>
          ))}
        </section>

        <section className="mt-8" aria-label="함께하는 사람">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold">함께하는 사람</h2>
            <Link href={`/tables/${id}/people`} className="flex h-11 items-center text-[14px] font-bold text-accent">모두 보기</Link>
          </div>
          <ul className="mt-1 divide-y divide-line2 rounded-[18px] bg-card px-4">
            {preview.map((m, i) => (
              <li key={m.id} className="flex min-h-[60px] items-center gap-3 py-2.5">
                <span style={{ background: ["#c9b8a4", "#a8b59b"][i % 2] }} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-ink" aria-hidden="true">{m.users.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{m.users.name}{m.attendance_status === "ATTENDED" && <span className="ml-1.5 text-[12px] font-bold text-leaf">도착</span>}</span>
                  <span className="block truncate text-[13px] text-muted">{[m.users.profiles?.job, ...interestsOf(m)].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
            {others.length > preview.length && (
              <li>
                <Link href={`/tables/${id}/people`} className="flex min-h-[52px] items-center justify-between text-[14px] text-muted">
                  {mine ? `나 포함 ${mems.length}명` : `${mems.length}명`} 모두 보기
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            )}
          </ul>
          <p className="mt-2 px-1 text-[12px] text-muted">이름과 하는 일만 보여요. 연락처는 공개되지 않아요.</p>
          {shared.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="이 테이블이 겹치는 것">
              {shared.map((x) => <li key={x} className="flex h-[30px] items-center rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent-text">{x}</li>)}
            </ul>
          )}
          {(t.explanation?.reasons?.length ?? 0) > 0 && (
            // 이렇게 모였어요: 맞추기 어려웠던 점(타협 사유)을 먼저, 문장은 자르지 않는다
            <ul className="mt-3 space-y-1 text-[14px] leading-relaxed text-ink2" aria-label="이렇게 모였어요">
              {[...(t.explanation?.reasons ?? [])].sort((a, b) => Number(/어려웠|못했|대신/.test(b)) - Number(/어려웠|못했|대신/.test(a))).slice(0, 3).map((r) => (
                <li key={r} className="flex gap-2"><span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8" aria-label="찾아가는 길">
          <h2 className="text-[18px] font-bold">찾아가는 길</h2>
          <div className="mt-3 rounded-[18px] bg-card p-4">
            <p className="text-[15px] font-semibold">{t.venues?.address ?? "식당이 정해지면 주소를 알려드릴게요"}</p>
            {resv && <p className="mt-1 text-[13px] text-muted">{resv.status === "CONFIRMED" ? `${CHANNEL_LABEL[resv.channel as Channel]} 예약 확정${resv.external_ref ? ` · ${resv.external_ref}` : ""}` : "운영팀이 예약하고 있어요"}</p>}
            {maps && <MapButtons links={maps} />}
            {(t.reservation_name || t.venues?.price_range) && (
              <dl className="mt-3 space-y-1.5 border-t border-line2 pt-3 text-[14px]">
                {t.reservation_name && <div className="flex justify-between gap-3"><dt className="text-muted">예약 이름</dt><dd className="font-semibold">{t.reservation_name}</dd></div>}
                {t.venues?.price_range && <div className="flex justify-between gap-3"><dt className="text-muted">1인 가격대</dt><dd className="font-semibold">{t.venues.price_range}</dd></div>}
              </dl>
            )}
            <p className="mt-3 border-t border-line2 pt-3 text-[13px] text-muted">못 드시는 음식: {myFood || "없어요"}{myFood ? " · 식당을 정할 때 운영팀이 참고해요" : ""}</p>
          </div>
        </section>

        {!done && (
          <section className="mt-8" aria-label="모임까지">
            <h2 className="text-[18px] font-bold">모임까지</h2>
            <ol className="mt-3">
              {timeline.map(([at, when, what], i) => {
                const passed = n >= at;
                return (
                  <li key={what} className="flex gap-3">
                    <span className="flex flex-col items-center" aria-hidden="true">
                      <span className={`mt-1.5 size-2.5 rounded-full ${passed ? "bg-accent" : "border-2 border-accent"}`} />
                      {i < timeline.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                    </span>
                    <span className="pb-4">
                      <span className={`block text-[15px] font-semibold ${passed ? "text-muted" : ""}`}>{when}</span>
                      <span className="block text-[13px] text-muted">{what}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {mine && <Link href={`/applications/${mine.id}`} className="inline-flex h-11 items-center text-[14px] text-muted underline underline-offset-4">취소·환불 규정 전체 보기</Link>}
          </section>
        )}

        <div className="mt-4"><ErrorText msg={e} /></div>
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-paper px-5 pt-3">
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
              {!done && <p className="mb-2.5 text-center text-[12px] text-muted">당일 취소는 안 되고, 연락 없이 오지 않으면 노쇼로 기록돼요.</p>}
              <LinkButton href={`/tables/${id}/chat`}>{done ? "단체방 다시 보기" : "단체방 들어가기"}</LinkButton>
            </>
          )}
          {mine && canCheckIn && <p className="mt-2 text-center text-[13px]"><Link href={`/tables/${id}/chat`} className="inline-flex h-11 items-center font-bold text-accent">단체방 들어가기</Link></p>}
        </div>
      </div>
    </div>
  );
}
