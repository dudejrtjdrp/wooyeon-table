import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Panel, RoundPicker, Stat } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { feedbackLegacyTarget } from "@/lib/legacy-links";
import { isBot } from "@/lib/sim/persona-id";
import { db } from "@/lib/supabase";
import { FeedbackHeader } from "./header";

export const dynamic = "force-dynamic";

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "-";
};

/** 피드백·안전 › 만족도·후기 (회차별). 신고와 사람별 보기는 옆 탭 */
export default async function Feedback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  // 예전 사람별 보기 주소(?u=, ?pq=)로 오면 사람별 보기 탭으로
  const legacy = feedbackLegacyTarget(sp);
  if (legacy) redirect(legacy);
  const r = typeof sp.r === "string" ? sp.r : undefined;
  const excludeDemo = sp.demo === "0";
  const { round, options } = await roundsAndCurrent(r);
  const { data: tables } = round ? await db().from("dining_tables").select("id").eq("round_id", round.id) : { data: [] };
  const ids = (tables ?? []).map((t) => t.id);
  const [{ data: fbs }, { data: prefs }, { count: attended }] = await Promise.all([
    ids.length ? db().from("feedbacks").select("mood_score,talk_score,venue_score,rejoin_intent,recommend_intent,comment,created_at,users(name,login_id,is_demo)").in("table_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? db().from("person_prefs").select("pref,users!person_prefs_from_user_fkey(is_demo)").in("table_id", ids) : Promise.resolve({ data: [] }),
    round
      ? (excludeDemo
          ? db().from("applications").select("id,users!inner(is_demo)", { count: "exact", head: true }).eq("round_id", round.id).eq("attendance_status", "ATTENDED").eq("users.is_demo", false)
          : db().from("applications").select("id", { count: "exact", head: true }).eq("round_id", round.id).eq("attendance_status", "ATTENDED"))
      : Promise.resolve({ count: 0 }),
  ]);
  const f0 = (fbs ?? []) as unknown as { mood_score: number | null; talk_score: number | null; venue_score: number | null; rejoin_intent: number | null; recommend_intent: number | null; comment: string | null; created_at: string; users: { name: string; login_id?: string; is_demo?: boolean } }[];
  // '시연 데이터 빼기'면 시연 계정(테스트 참가자·봇)이 남긴 후기·선호를 빼고 센다
  const demoN = f0.filter((x) => x.users?.is_demo).length;
  const f = excludeDemo ? f0.filter((x) => !x.users?.is_demo) : f0;
  const pr = ((prefs ?? []) as unknown as { pref: string; users: { is_demo: boolean } | null }[]).filter((p) => !excludeDemo || !p.users?.is_demo);
  const again = pr.filter((p) => p.pref === "again").length;
  const avoid = pr.filter((p) => p.pref === "avoid").length;
  const comments = f.filter((x) => x.comment);

  return (
    <div>
      <FeedbackHeader
        current="/admin/feedback"
        r={round?.id}
        desc="만족도와 사람별 선호는 다음 매칭에 바로 반영돼요. 신고는 접수 즉시 두 사람을 분리하고, 조치는 예외 처리함에서 해요."
        how={["오른쪽에서 회차 고르기", "만족도와 남긴 한마디 보기", "신고·사람별 선호는 위 탭에서"]}
        actions={<RoundPicker rounds={options} current={round?.id} extra={<label className="flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" name="demo" value="0" defaultChecked={excludeDemo} className="size-4" />시연 데이터 빼기</label>} />}
      />
      {demoN > 0 && <p className="mt-3 text-[13px] text-muted">{excludeDemo ? `시연 계정(테스트 참가자·봇) 후기 ${demoN}개를 빼고 셌어요.` : `시연 계정(테스트 참가자·봇) 후기 ${demoN}개도 함께 셌어요.`}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="응답률" value={attended ? `${Math.round((f.length / attended) * 100)}%` : "-"} sub={`참석 ${attended ?? 0}명 중 ${f.length}명`} />
        <Stat label="테이블 분위기" value={avg(f.map((x) => x.mood_score))} sub="5점 만점" />
        <Stat label="대화" value={avg(f.map((x) => x.talk_score))} />
        <Stat label="식당" value={avg(f.map((x) => x.venue_score))} />
        <Stat label="재참여 의향" value={avg(f.map((x) => x.rejoin_intent))} />
        <Stat label="추천 의향" value={avg(f.map((x) => x.recommend_intent))} />
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="사람별 선호" action={<Badge v={["참가자끼리는 안 보여요", "muted"]} />}>
          <p className="text-[14px]">또 만나고 싶어요 <b>{again}건</b> · 다시는 싫어요 <b>{avoid}건</b></p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            누가 누구를 골랐는지는 고른 사람과 운영자만 알아요. 상대 참가자 화면 어디에도 나오지 않아요.
            &lsquo;다시는 싫어요&rsquo;는 다음 매칭에서 같은 테이블에 앉지 않게 하고, &lsquo;또 만나고 싶어요&rsquo;는 점수를 조금 더해요.
          </p>
          <Link href={`/admin/feedback/person${round ? `?r=${round.id}` : ""}`} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline">사람별로 누가 누구를 골랐는지 보기</Link>
        </Panel>
        <Panel title="남긴 한마디" action={<span className="text-[13px] text-muted">{comments.length}개</span>}>
          <ul className="space-y-2 text-[14px]">
            {comments.slice(0, 10).map((x, i) => (
              <li key={i} className="rounded-xl bg-paper px-3 py-2"><span className="text-[12px] text-muted">{x.users.name}{isBot(x.users) ? " (시연 봇)" : ""} · {fmtDateTime(x.created_at)}</span><p>{x.comment}</p></li>
            ))}
            {!comments.length && <li className="text-muted">아직 없어요.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
