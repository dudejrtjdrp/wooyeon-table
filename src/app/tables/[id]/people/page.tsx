import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { now } from "@/lib/clock";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TONES = ["#c9b8a4", "#a8b59b", "#d8b27a", "#9fa9b5", "#c4a29a", "#b9c2a4"];

/** 테이블 > 함께하는 사람 모두 보기: 이름·하는 일·겹치는 관심사, 그리고 왜 이렇게 모였는지 */
export default async function TablePeople({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { data: raw } = await db().from("dining_tables").select("id,explanation").eq("id", id).maybeSingle();
  if (!raw) redirect("/");
  const { data: memRaw } = await db()
    .from("applications")
    .select("id,user_id,attendance_status,users(name,profiles(job,gender,birth_year,interests))")
    .eq("table_id", id)
    .eq("match_status", "CONFIRMED");
  type P = { job: string | null; gender: string; birth_year: number; interests: string[] | null };
  const mems = (memRaw ?? []) as unknown as { id: string; user_id: string; attendance_status: string; users: { name: string; profiles: P | null } }[];
  if (!mems.some((m) => m.user_id === me.id) && me.role !== "admin") redirect("/");

  const n = await now();
  const tally = new Map<string, number>();
  for (const m of mems) for (const x of m.users.profiles?.interests ?? []) tally.set(x, (tally.get(x) ?? 0) + 1);
  const shared = [...tally.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([x]) => x);
  const reasons = (raw as { explanation: { reasons?: string[] } | null }).explanation?.reasons ?? [];
  const ages = mems.map((m) => m.users.profiles?.birth_year).filter((x): x is number => Boolean(x)).map((by) => n.getFullYear() - by + 1);
  const sorted = [...mems].sort((a, b) => Number(b.user_id === me.id) - Number(a.user_id === me.id));

  return (
    <Screen title={`함께하는 사람 ${mems.length}명`} back={`/tables/${id}`}>
      <div className="px-4 pb-10 pt-2">
        <p className="px-1 text-[14px] text-muted">{ages.length ? `${Math.min(...ages)}~${Math.max(...ages)}살 · ` : ""}서로 처음 만나요</p>
        <ul className="mt-4 divide-y divide-line2 rounded-[18px] bg-card px-4">
          {sorted.map((m, i) => {
            const isMe = m.user_id === me.id;
            const overlap = (m.users.profiles?.interests ?? []).filter((x) => shared.includes(x));
            return (
              <li key={m.id} className="flex min-h-[68px] items-center gap-3 py-3">
                <span style={isMe ? undefined : { background: TONES[i % TONES.length] }} className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${isMe ? "bg-accent text-accent-ink" : "text-ink"}`} aria-hidden="true">{isMe ? "나" : m.users.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{m.users.name}{m.attendance_status === "ATTENDED" && <span className="ml-1.5 text-[12px] font-bold text-leaf">도착</span>}</span>
                  <span className="block text-[13px] text-muted">{[m.users.profiles?.job, ...overlap].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 px-1 text-[12px] text-muted">이름과 하는 일만 보여요. 연락처는 공개되지 않아요.</p>

        {shared.length > 0 && (
          <section className="mt-8">
            <h2 className="px-1 text-[18px] font-bold">이 테이블이 겹치는 것</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {shared.map((x) => <li key={x} className="flex h-8 items-center rounded-full bg-accent-soft px-3.5 text-[14px] font-semibold text-accent-text">{x}</li>)}
            </ul>
          </section>
        )}

        {reasons.length > 0 && (
          <section className="mt-8">
            <h2 className="px-1 text-[18px] font-bold">이렇게 모였어요</h2>
            <ul className="mt-3 space-y-2 rounded-[18px] bg-card p-4 text-[15px] leading-relaxed text-ink2">
              {reasons.map((r) => <li key={r} className="flex gap-2.5"><span aria-hidden="true" className="mt-[10px] size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>)}
            </ul>
          </section>
        )}
      </div>
    </Screen>
  );
}
