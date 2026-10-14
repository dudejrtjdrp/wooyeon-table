import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, Stat } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "-";
};

export default async function Feedback({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const { r } = await searchParams;
  const { rounds, round } = await roundsAndCurrent(r);
  const { data: tables } = round ? await db().from("dining_tables").select("id").eq("round_id", round.id) : { data: [] };
  const ids = (tables ?? []).map((t) => t.id);
  const [{ data: fbs }, { data: prefs }, { data: reports }, { count: attended }] = await Promise.all([
    ids.length ? db().from("feedbacks").select("mood_score,talk_score,venue_score,rejoin_intent,recommend_intent,comment,created_at,users(name)").in("table_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? db().from("person_prefs").select("pref").in("table_id", ids) : Promise.resolve({ data: [] }),
    db().from("safety_reports").select("id,reason,detail,status,action,created_at,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)").order("created_at", { ascending: false }).limit(50),
    round ? db().from("applications").select("id", { count: "exact", head: true }).eq("round_id", round.id).eq("attendance_status", "ATTENDED") : Promise.resolve({ count: 0 }),
  ]);
  const f = (fbs ?? []) as unknown as { mood_score: number | null; talk_score: number | null; venue_score: number | null; rejoin_intent: number | null; recommend_intent: number | null; comment: string | null; created_at: string; users: { name: string } }[];
  const again = (prefs ?? []).filter((p) => p.pref === "again").length;
  const avoid = (prefs ?? []).filter((p) => p.pref === "avoid").length;
  const reps = (reports ?? []) as unknown as { id: string; reason: string; detail: string | null; status: string; action: string | null; created_at: string; reporter: { name: string }; reported: { name: string } }[];
  const ACTION: Record<string, string> = { none: "조치 없음", warning: "경고", restricted: "참가 제한", banned: "영구 제한" };

  return (
    <div>
      <PageHeader title="피드백·안전" desc="만족도와 사람별 선호는 다음 매칭에 바로 반영돼요. 신고는 접수 즉시 두 사람을 분리하고, 조치는 예외 처리함에서 해요." actions={<RoundPicker rounds={rounds} current={round?.id} />} />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="응답률" value={attended ? `${Math.round((f.length / attended) * 100)}%` : "-"} sub={`${f.length}/${attended ?? 0}명`} />
        <Stat label="테이블 분위기" value={avg(f.map((x) => x.mood_score))} sub="5점 만점" />
        <Stat label="대화" value={avg(f.map((x) => x.talk_score))} />
        <Stat label="식당" value={avg(f.map((x) => x.venue_score))} />
        <Stat label="재참여 의향" value={avg(f.map((x) => x.rejoin_intent))} />
        <Stat label="추천 의향" value={avg(f.map((x) => x.recommend_intent))} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="사람별 선호 (비공개)">
          <p className="text-[14px]">또 만나고 싶어요 <b>{again}건</b> · 다시는 싫어요 <b>{avoid}건</b></p>
          <p className="mt-1 text-[13px] text-muted">&lsquo;다시는 싫어요&rsquo;는 다음 매칭에서 같은 테이블에 앉지 않게 하고, &lsquo;또 만나고 싶어요&rsquo;는 점수를 조금 더해요.</p>
          <p className="mt-5 text-[14px] font-semibold">남긴 한마디</p>
          <ul className="mt-2 space-y-2 text-[14px]">
            {f.filter((x) => x.comment).slice(0, 10).map((x, i) => (
              <li key={i} className="rounded-xl bg-paper px-3 py-2"><span className="text-[12px] text-muted">{x.users.name} · {fmtDateTime(x.created_at)}</span><p>{x.comment}</p></li>
            ))}
            {!f.some((x) => x.comment) && <li className="text-muted">아직 없어요.</li>}
          </ul>
        </Panel>
        <Panel title="안전 신고" action={<Link href="/admin/exceptions" className="text-[13px] text-muted hover:text-ink">예외 처리함에서 조치</Link>}>
          <ul className="divide-y divide-line text-[14px]">
            {reps.map((x) => (
              <li key={x.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <span>{x.reporter?.name} → <b>{x.reported?.name}</b></span>
                  <Badge v={x.status === "open" ? ["검토 대기", "danger"] : [ACTION[x.action ?? "none"] ?? "처리됨", "leaf"]} />
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{x.reason}{x.detail ? `, "${x.detail}"` : ""} · {fmtDateTime(x.created_at)}</p>
              </li>
            ))}
            {!reps.length && <li className="py-2 text-muted">신고가 없어요.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
