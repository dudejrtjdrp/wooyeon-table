import Link from "next/link";
import { Badge, PageHeader, Panel, RoundPicker, Stat, btnLight, ctl } from "@/components/admin-ui";
import { roundsAndCurrent } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { escapeLike, maskPhone, parseMemberQuery } from "@/lib/members";
import { reportStatusText } from "@/lib/safety-rules";
import { db } from "@/lib/supabase";
import { PersonSafety, ReopenForm } from "./person-safety";

export const dynamic = "force-dynamic";

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "-";
};

type Person = { id: string; name: string; phone: string | null };

/** 사람별 보기에서 찾을 회원 (이름·연락처 뒤 4자리) */
async function findPeople(raw: string | undefined): Promise<Person[]> {
  const q = parseMemberQuery(raw);
  const base = () => db().from("users").select("id,name,phone").eq("role", "user").order("created_at", { ascending: false }).limit(20);
  if (q.kind === "phone4") return ((await base().like("phone", `%${q.digits}`)).data ?? []) as Person[];
  if (q.kind === "phone") return ((await base().eq("phone", q.digits)).data ?? []) as Person[];
  if (q.kind === "text") return ((await base().ilike("name", `%${escapeLike(q.text)}%`)).data ?? []) as Person[];
  return [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Feedback({ searchParams }: { searchParams: Promise<{ r?: string; u?: string; pq?: string }> }) {
  const me = await requireAdmin();
  const { r, u, pq } = await searchParams;
  const personId = u && UUID.test(u) ? u : undefined;
  const [people, { data: person }] = await Promise.all([
    personId ? Promise.resolve([] as Person[]) : findPeople(pq),
    personId ? db().from("users").select("id,name").eq("id", personId).eq("role", "user").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { rounds, round } = await roundsAndCurrent(r);
  const { data: tables } = round ? await db().from("dining_tables").select("id").eq("round_id", round.id) : { data: [] };
  const ids = (tables ?? []).map((t) => t.id);
  const [{ data: fbs }, { data: prefs }, { data: reports }, { count: attended }] = await Promise.all([
    ids.length ? db().from("feedbacks").select("mood_score,talk_score,venue_score,rejoin_intent,recommend_intent,comment,created_at,users(name)").in("table_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? db().from("person_prefs").select("pref").in("table_id", ids) : Promise.resolve({ data: [] }),
    db().from("safety_reports").select("id,reporter_id,reported_id,reason,detail,status,action,created_at,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)").order("created_at", { ascending: false }).limit(50),
    round ? db().from("applications").select("id", { count: "exact", head: true }).eq("round_id", round.id).eq("attendance_status", "ATTENDED") : Promise.resolve({ count: 0 }),
  ]);
  const f = (fbs ?? []) as unknown as { mood_score: number | null; talk_score: number | null; venue_score: number | null; rejoin_intent: number | null; recommend_intent: number | null; comment: string | null; created_at: string; users: { name: string } }[];
  const again = (prefs ?? []).filter((p) => p.pref === "again").length;
  const avoid = (prefs ?? []).filter((p) => p.pref === "avoid").length;
  const reps = (reports ?? []) as unknown as { id: string; reporter_id: string; reported_id: string; reason: string; detail: string | null; status: string; action: string | null; created_at: string; reporter: { name: string }; reported: { name: string } }[];
  const canWrite = me.level === "full";
  const qs = new URLSearchParams();
  if (r) qs.set("r", r);
  if (personId) qs.set("u", personId);
  const back = `/admin/feedback${qs.toString() ? `?${qs.toString()}` : ""}`;

  return (
    <div>
      <PageHeader
        title="피드백·안전"
        desc="만족도와 사람별 선호는 다음 매칭에 바로 반영돼요. 신고는 접수 즉시 두 사람을 분리하고, 조치는 예외 처리함에서 해요."
        how={["오른쪽에서 회차 고르고 만족도 보기", "'안전 신고'에서 검토 대기 건 확인", "경고·참가 제한은 예외 처리함에서", "아래에서 한 사람이 남기고 받은 것 찾아보기"]}
        actions={<RoundPicker rounds={rounds} current={round?.id} />}
      />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="응답률" value={attended ? `${Math.round((f.length / attended) * 100)}%` : "-"} sub={`참석 ${attended ?? 0}명 중 ${f.length}명`} />
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
        <Panel title="안전 신고" action={<Link href="/admin/exceptions?k=safety" className="text-[13px] text-muted hover:text-ink">예외 처리함에서 조치</Link>}>
          <div id="reports" className="scroll-mt-24" />
          <ul className="divide-y divide-line text-[14px]">
            {reps.map((x) => (
              <li key={x.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <span>
                    <Link href={`/admin/feedback?u=${x.reporter_id}#person`} className="hover:text-accent">{x.reporter?.name}</Link> → <Link href={`/admin/feedback?u=${x.reported_id}#person`} className="font-bold hover:text-accent">{x.reported?.name}</Link>
                  </span>
                  <Badge v={x.status === "open" ? ["검토 대기", "danger"] : [reportStatusText(x), "leaf"]} />
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{x.reason}{x.detail ? `, "${x.detail}"` : ""} · {fmtDateTime(x.created_at)}</p>
                {x.status !== "open" && <ReopenForm id={x.id} back={`${back}#reports`} canWrite={canWrite} />}
              </li>
            ))}
            {!reps.length && <li className="py-2 text-muted">신고가 없어요.</li>}
          </ul>
        </Panel>
      </div>

      <h2 id="person" className="mb-3 mt-8 scroll-mt-24 text-[17px] font-bold">사람별 비선호·차단·신고</h2>
      <form className="flex flex-wrap gap-2">
        {r && <input type="hidden" name="r" value={r} />}
        <input name="pq" defaultValue={pq ?? ""} placeholder="이름, 연락처 뒤 4자리" aria-label="사람 찾기" className={`${ctl} w-72`} />
        <button className={btnLight}>찾기</button>
        {personId && <Link href={`/admin/feedback${r ? `?r=${r}` : ""}#person`} className={btnLight}>다른 사람 보기</Link>}
      </form>
      {personId ? (
        person ? (
          <div className="mt-3">
            <p className="mb-3 text-[15px]"><Link href={`/admin/members/${person.id}`} className="font-bold text-ink hover:text-accent">{person.name}님</Link><span className="text-muted">이 남기고 받은 것</span></p>
            <PersonSafety userId={person.id} back={`${back}#person`} canWrite={canWrite} />
          </div>
        ) : <p className="mt-3 text-[14px] text-muted">회원을 찾지 못했어요.</p>
      ) : pq ? (
        <ul className="mt-3 divide-y divide-line rounded-[20px] bg-card px-4 shadow-card">
          {people.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/feedback?${r ? `r=${r}&` : ""}u=${x.id}#person`} className="flex min-h-12 items-center gap-3 text-[14px] hover:text-accent">
                <span className="font-semibold">{x.name}</span><span className="tabular-nums text-muted">{maskPhone(x.phone)}</span>
              </Link>
            </li>
          ))}
          {!people.length && <li className="py-4 text-[14px] text-muted">맞는 회원이 없어요. 두 글자 이상이나 연락처 뒤 4자리로 찾아 주세요.</li>}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] text-muted">찾은 사람이 남기고 받은 &lsquo;다시는 싫어요&rsquo;·차단·신고를 한 번에 봐요. 위 신고 목록에서 이름을 눌러도 돼요.</p>
      )}
    </div>
  );
}
