import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { RoundTable } from "@/components/brand";
import { EmptyState, LinkButton, List, Pill, SectionTitle, TabScreen } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { dateKey, dday, ddayLabel, fmtSlot } from "@/lib/format";
import { sidoOf } from "@/lib/regions";
import { PASSES, won } from "@/lib/constants";
import { headline } from "@/lib/status";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 일정: 모집 중인 회차. 로그인 전에도 둘러볼 수 있다 */
export default async function Rounds() {
  const me = await getMe();
  const t = await now();
  const { data: rounds } = await db()
    .from("rounds")
    .select("id,title,apply_deadline,match_at,status,slots(id,region,sido,starts_at)")
    .eq("status", "open")
    .gt("apply_deadline", t.toISOString())
    .order("apply_deadline");
  const { data: mineRaw } = me
    ? await db().from("applications").select("id,round_id,application_status,payment_status,match_status,attendance_status,resolution,table_id,created_at,rounds(title)").eq("user_id", me.id).order("created_at", { ascending: false })
    : { data: [] };
  const mine = (mineRaw ?? []) as unknown as (Parameters<typeof headline>[0] & { id: string; round_id: string; application_status: string; match_status: string; attendance_status: string | null; rounds: { title: string } })[];
  const applied = new Map(mine.filter((a) => a.application_status !== "CANCELED").map((a) => [a.round_id, a.id]));
  // 내 신청: 테이블이 확정된 건 단체방 탭에서 보여주고, 여기엔 진행 중·마무리된 신청만
  const notTable = mine.filter((a) => a.match_status !== "CONFIRMED");
  const pending = notTable.filter((a) => a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));
  const closed = notTable.filter((a) => !pending.includes(a)).slice(0, 5);

  return (
    <TabScreen title="일정" sub="동네와 날짜를 여러 개 고를수록 테이블이 잘 꾸려져요.">
      {!rounds?.length && <EmptyState icon={<CalendarDays size={40} className="text-faint" />} title="지금은 모집 중인 일정이 없어요" body="새 일정이 열리면 알림으로 알려드릴게요." />}
      <div className="mt-5 flex flex-col gap-2.5">
        {rounds?.map((r, i) => {
          const slots = [...(r.slots ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const times = [...new Map(slots.map((s) => [dateKey(s.starts_at), s.starts_at])).values()];
          const bySido = new Map<string, string[]>();
          for (const s of slots) {
            const k = s.sido ?? sidoOf(s.region) ?? "기타";
            if (!bySido.has(k)) bySido.set(k, []);
            if (!bySido.get(k)!.includes(s.region)) bySido.get(k)!.push(s.region);
          }
          const appId = applied.get(r.id);
          const href = !me ? `/login?next=${encodeURIComponent(`/apply/${r.id}`)}` : appId ? `/applications/${appId}` : `/apply/${r.id}`;
          return (
            <article key={r.id} className="animate-rise rounded-[24px] bg-card p-[22px]" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[20px] font-black">{r.title}</h2>
                  <p className="mt-1 text-[14px] text-muted">{fmtSlot(r.apply_deadline)} 마감 · 마감하면 바로 테이블을 꾸려요</p>
                </div>
                {appId ? <Pill tone="accent">신청했어요</Pill> : <Pill tone="muted">{ddayLabel(dday(times[0] ?? r.apply_deadline, t))}</Pill>}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <RoundTable size={76} filled={appId ? 1 : 0} me={Boolean(appId)} />
                <ul className="min-w-0 flex-1 space-y-1 text-[15px]">
                  {times.map((iso) => <li key={iso} className="font-extrabold">{fmtSlot(iso)}</li>)}
                </ul>
              </div>
              <p className="mt-3 text-[13px] text-muted">1회 {won(PASSES.single.amount)} · 식사비는 현장에서 각자 계산해요</p>
              <dl className="mt-3 space-y-1.5 rounded-[14px] bg-field px-4 py-3 text-[13px]">
                {[...bySido.entries()].map(([sd, areas]) => (
                  <div key={sd} className="flex gap-2">
                    <dt className="w-8 shrink-0 font-bold text-muted">{sd}</dt>
                    <dd className="text-ink2">{areas.join(" · ")}</dd>
                  </div>
                ))}
              </dl>
              <LinkButton href={href} tone={appId ? "outline" : "accent"} className="mt-4">{!me ? "로그인하고 신청하기" : appId ? "내 신청 보기" : "이 일정 신청하기"}</LinkButton>
            </article>
          );
        })}
      </div>
      {[["진행 중인 신청", pending], ["마무리된 신청", closed]].map(([label, list]) =>
        (list as typeof mine).length > 0 && (
          <section key={label as string} aria-label={label as string}>
            <SectionTitle>{label as string}</SectionTitle>
            <List>
              {(list as typeof mine).map((a) => {
                const h = headline(a);
                return (
                  <Link key={a.id} href={`/applications/${a.id}`} className="flex min-h-[64px] items-center gap-3 px-5 py-3 active:bg-line2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-extrabold">{a.rounds.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{h.desc}</span>
                    </span>
                    <Pill tone={h.tone}>{h.label}</Pill>
                    <ChevronRight size={18} className="shrink-0 text-[#b5c0ba]" />
                  </Link>
                );
              })}
            </List>
          </section>
        )
      )}
      <p className="mt-6 text-center text-[13px] text-muted">
        지금은 서울 네 곳에서 먼저 모여요. <Link href="/wish" className="inline-flex h-11 items-center font-bold text-accent underline underline-offset-4">다른 동네 원해요</Link>
      </p>
      {!me && <p className="mt-5 text-center text-[13px] text-muted"><Link href="/login" className="inline-flex h-11 items-center font-bold text-accent underline underline-offset-4">로그인</Link>하면 바로 신청할 수 있어요.</p>}
    </TabScreen>
  );
}
