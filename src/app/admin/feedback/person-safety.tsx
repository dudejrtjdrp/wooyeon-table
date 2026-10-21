import { isBot } from "@/lib/sim/persona-id";
import Link from "next/link";
import { Badge, Panel, btnLight } from "@/components/admin-ui";
import { Required } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtSlot } from "@/lib/format";
import { type FeedbackRow, feedbackSignals } from "@/lib/matching/feedback";
import { pairKey } from "@/lib/matching/types";
import { type BlockIn, type MatchRule, type MetIn, type PrefIn, type RelationRow, type ReportIn, RULE, SOURCE_TEXT, personMatchView } from "@/lib/person-match";
import { reportStatusText } from "@/lib/safety-rules";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../confirm-button";
import { reopenReport } from "./actions";

type Report = { id: string; reporter_id: string; reported_id: string; reason: string; detail: string | null; status: string; action: string | null; admin_note: string | null; created_at: string; reviewed_at: string | null };
type TableInfo = { id: string; status?: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null };

/** 닫은 신고 다시 열기 폼 (사유 필수, 한 번 더 확인) */
export function ReopenForm({ id, back, canWrite }: { id: string; back: string; canWrite: boolean }) {
  if (!canWrite) return null;
  return (
    <details className="mt-1.5">
      <summary className="inline-flex min-h-9 cursor-pointer items-center text-[13px] font-semibold text-accent">다시 열어 검토하기</summary>
      <form action={reopenReport} className="mt-2 space-y-2">
        <input type="hidden" name="report_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <label className="block text-[13px] text-muted">
          다시 여는 사유<Required />
          <textarea name="note" rows={2} required minLength={4} placeholder="예: 같은 사람에 대한 신고가 또 들어와 다시 봐요" className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 text-[14px] text-ink outline-none focus:border-accent" />
        </label>
        <ConfirmButton confirm="이 신고를 '검토 전'으로 되돌리고 예외 처리함에 다시 올려요. 이미 건 계정 조치는 그대로 남아요. 계속할까요?" className={btnLight}>다시 열기</ConfirmButton>
      </form>
    </details>
  );
}

/** 다음 매칭에서 어떻게 쓰이는지 배지 (풀이는 마우스를 올리면) */
const RuleBadge = ({ rule }: { rule: MatchRule }) => (
  <span title={RULE[rule].tip}><Badge v={[RULE[rule].label, RULE[rule].tone]} /></span>
);

/** 배지 세 가지 풀이 */
function RuleLegend() {
  const rules: MatchRule[] = ["hard", "soft", "score"];
  return (
    <ul aria-label="배지 풀이" className="grid gap-2 rounded-2xl bg-paper px-4 py-3 text-[13px] text-ink2 md:grid-cols-3">
      {rules.map((r) => (
        <li key={r} className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
          <Badge v={[RULE[r].label, RULE[r].tone]} />
          <span className="min-w-0 flex-1 basis-40">{RULE[r].tip}</span>
        </li>
      ))}
    </ul>
  );
}

const WARN = new Set(["avoid", "block", "report", "low"]);

function RelationList({ rows, names, tables, empty }: { rows: RelationRow[]; names: Map<string, string>; tables: Map<string, TableInfo>; empty: string }) {
  if (!rows.length) return <p className="text-[14px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-xl bg-paper px-3 text-[14px]">
      {rows.map((r) => (
        <li key={r.userId} className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link href={`/admin/members/${r.userId}`} className="inline-flex min-h-9 items-center font-semibold text-ink hover:text-accent">{names.get(r.userId) ?? "알 수 없음"}</Link>
            <RuleBadge rule={r.rule} />
            {r.note && <span className="text-[12px] text-muted">{r.note}</span>}
          </div>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink2">
            {r.reasons.map((x, i) => {
              const t = x.tableId ? tables.get(x.tableId) : undefined;
              const where = t?.slots ? `${fmtSlot(t.slots.starts_at)} ${t.slots.region}${t.venues ? ` · ${t.venues.name}` : ""}` : null;
              return (
                <li key={i} className="min-w-0">
                  <span className={`font-semibold ${WARN.has(x.source) ? "text-danger" : "text-ink"}`}>{SOURCE_TEXT[x.source]}</span>
                  {where && x.tableId ? <> · <Link href={`/admin/tables/${x.tableId}`} className="underline-offset-4 hover:text-accent hover:underline">{where}</Link></> : x.at ? ` · ${fmtDate(x.at)}` : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * 한 사람의 선호·차단·신고·만남 기록과, 그게 다음 자동 매칭에서 어떻게 쓰이는지 (PRD 11장 '개인별 비선호·차단·신고 검토', MAT-05·06).
 * 회원 상세와 피드백·안전(사람별 보기)이 함께 쓴다. 참가자끼리는 안 보이고(FDB-04) 운영자 화면에서만 보인다
 */
export async function PersonSafety({ userId, back, canWrite }: { userId: string; back: string; canWrite: boolean }) {
  // or() 조건에 그대로 들어가니 id 모양만 받는다
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  const [{ data: prefs }, { data: blocks }, { data: reps }, { data: mine }] = await Promise.all([
    db().from("person_prefs").select("from_user,to_user,pref,table_id,created_at").or(`from_user.eq.${userId},to_user.eq.${userId}`).limit(500),
    db().from("blocks").select("blocker_id,blocked_id,created_at").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`).limit(500),
    db().from("safety_reports").select("id,reporter_id,reported_id,reason,detail,status,action,admin_note,created_at,reviewed_at").or(`reporter_id.eq.${userId},reported_id.eq.${userId}`).order("created_at", { ascending: false }).limit(100),
    // 이미 같이 앉은 사람: 끝난(DONE) 테이블에 둘 다 참석한 경우만 (encounters 뷰와 같은 기준)
    db().from("applications").select("table_id,dining_tables!inner(id,status,slots(starts_at,region),venues(name))").eq("user_id", userId).eq("attendance_status", "ATTENDED").eq("dining_tables.status", "DONE").limit(200),
  ]);
  const myTables = ((mine ?? []) as unknown as { table_id: string; dining_tables: TableInfo }[]).map((a) => a.dining_tables).filter(Boolean);
  const myTableIds = myTables.map((t) => t.id);
  const [{ data: seats }, { data: fbs }] = await Promise.all([
    myTableIds.length ? db().from("applications").select("user_id,table_id").in("table_id", myTableIds).eq("attendance_status", "ATTENDED") : Promise.resolve({ data: [] }),
    myTableIds.length ? db().from("feedbacks").select("user_id,table_id,mood_score,talk_score,rejoin_intent").in("table_id", myTableIds) : Promise.resolve({ data: [] }),
  ]);
  const seatRows = (seats ?? []) as { user_id: string; table_id: string }[];
  const reports = (reps ?? []) as Report[];
  const prefRows = (prefs ?? []) as PrefIn[];
  const blockRows = (blocks ?? []) as BlockIn[];

  // 이름과 시연 봇 여부를 먼저 읽는다(봇이 고른 '또 만나고 싶어요'는 엔진이 안 쓴다)
  const others = [...new Set([
    ...prefRows.flatMap((p) => [p.from_user, p.to_user]),
    ...blockRows.flatMap((b) => [b.blocker_id, b.blocked_id]),
    ...reports.flatMap((r) => [r.reporter_id, r.reported_id]),
    ...seatRows.map((s) => s.user_id),
  ])].filter((x) => x !== userId);
  const { data: users } = others.length ? await db().from("users").select("id,name,login_id,is_demo").in("id", others) : { data: [] };
  const bots = new Set((users ?? []).filter((u) => isBot(u)).map((u) => u.id as string));
  const names = new Map((users ?? []).map((u) => [u.id as string, isBot(u) ? `${u.name} (시연 봇)` : (u.name as string)]));

  // 후기가 낮았던 사이: 엔진과 같은 계산(feedback.ts)을 이 사람의 테이블에만 돌린다
  const cool = feedbackSignals(((fbs ?? []) as FeedbackRow[]).filter((f) => !bots.has(f.user_id)), seatRows, new Map()).cool;
  const lowMarked = new Set<string>();
  const met: MetIn[] = [];
  for (const t of [...myTables].sort((a, b) => (b.slots?.starts_at ?? "").localeCompare(a.slots?.starts_at ?? ""))) {
    for (const s of seatRows) {
      if (s.table_id !== t.id || s.user_id === userId) continue;
      const k = pairKey(userId, s.user_id);
      const low = cool.has(k) && !lowMarked.has(k);
      if (low) lowMarked.add(k);
      met.push({ userId: s.user_id, at: t.slots?.starts_at ?? null, tableId: t.id, low });
    }
  }

  const view = personMatchView(userId, { prefs: prefRows, blocks: blockRows, reports: reports as ReportIn[], met, bots });
  // 선호를 남긴 테이블 중 아직 안 읽은 것
  const known = new Map(myTables.map((t) => [t.id, t]));
  const need = [...new Set(prefRows.map((p) => p.table_id).filter((x): x is string => !!x && !known.has(x)))];
  const { data: tbs } = need.length ? await db().from("dining_tables").select("id,slots(starts_at,region),venues(name)").in("id", need) : { data: [] };
  for (const t of (tbs ?? []) as unknown as TableInfo[]) known.set(t.id, t);

  const got = reports.filter((r) => r.reported_id === userId);
  const gave = reports.filter((r) => r.reporter_id === userId);

  const ReportRow = ({ r, other, dir }: { r: Report; other: string; dir: string }) => (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums text-[13px] text-muted">{fmtDate(r.created_at)}</span>
        <span className="text-[13px] text-muted">{dir}</span>
        <Link href={`/admin/members/${other}`} className="font-semibold text-ink hover:text-accent">{names.get(other) ?? "알 수 없음"}</Link>
        <span className="min-w-0 flex-1 text-ink">{r.reason}</span>
        <Badge v={r.status === "open" ? ["검토 전", "danger"] : [reportStatusText(r), "muted"]} />
      </div>
      {r.detail && <p className="mt-0.5 text-[13px] text-muted">&ldquo;{r.detail}&rdquo;</p>}
      {r.status === "open" ? (
        <Link href="/admin/exceptions?k=safety" className="mt-1 inline-flex min-h-9 items-center text-[13px] font-semibold text-accent hover:underline">예외 처리함에서 조치하기</Link>
      ) : (
        <>
          {(r.reviewed_at || r.admin_note) && <p className="mt-0.5 text-[12px] text-muted">{r.reviewed_at ? `${fmtDateTime(r.reviewed_at)} 검토` : ""}{r.admin_note ? ` · ${r.admin_note}` : ""}</p>}
          <ReopenForm id={r.id} back={back} canWrite={canWrite} />
        </>
      )}
    </li>
  );

  const summary: { id: string; label: string; n: number; rule: MatchRule }[] = [
    { id: "avoid-by", label: "이 사람이 피하고 싶은 사람", n: view.avoidByMe.length, rule: "hard" },
    { id: "avoid-me", label: "이 사람을 피하고 싶은 사람", n: view.avoidMe.length, rule: "hard" },
    { id: "again", label: "다시 만나고 싶은 사람", n: view.again.length, rule: "score" },
    { id: "met", label: "이미 같이 앉은 사람", n: view.met.length, rule: "soft" },
  ];
  const sections: { id: string; title: string; rule: MatchRule; desc: string; rows: RelationRow[]; empty: string }[] = [
    { id: "avoid-by", title: "이 사람이 피하고 싶은 사람", rule: "hard", desc: "이 사람이 모임 뒤에 '다시는 싫어요'를 고르거나, 차단·신고한 사람이에요.", rows: view.avoidByMe, empty: "피하고 싶다고 남긴 사람이 없어요." },
    { id: "avoid-me", title: "이 사람을 피하고 싶은 사람", rule: "hard", desc: "상대가 이 사람에게 '다시는 싫어요'를 고르거나 차단·신고했어요. 이 사람에게는 누가 골랐는지 보이지 않아요.", rows: view.avoidMe, empty: "이 사람을 피하고 싶다고 남긴 사람이 없어요." },
    { id: "again", title: "다시 만나고 싶은 사람", rule: "score", desc: "어느 한쪽이라도 '또 만나고 싶어요'를 고른 사이예요. 같은 테이블이면 점수를 조금 더해요.", rows: view.again, empty: "또 만나고 싶다고 고른 사이가 없어요." },
    { id: "met", title: "이미 같이 앉은 사람", rule: "soft", desc: "끝난 모임에서 함께 참석한 사람이에요. 새 사람을 먼저 만나도록 점수를 깎고, 후기가 낮았던 사이는 더 깎아요.", rows: view.met, empty: "아직 함께 참석한 모임이 없어요." },
  ];

  return (
    <div id="safety" className="space-y-4">
      <section aria-label="다음 매칭 요약" className="shadow-card rounded-[20px] bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">다음 자동 매칭에서는</h2>
          <Badge v={["참가자끼리는 안 보여요", "muted"]} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {summary.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex h-full min-h-11 flex-col gap-1 rounded-xl bg-paper px-3 py-2.5 hover:ring-1 hover:ring-accent">
                <span className="text-[13px] text-ink2">{s.label}</span>
                <span className="flex flex-wrap items-center gap-2"><span className="text-[20px] font-bold tabular-nums text-ink">{s.n}명</span>{s.n > 0 && <RuleBadge rule={s.rule} />}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-3"><RuleLegend /></div>
      </section>

      {sections.map((s) => (
        <div key={s.id} id={s.id} className="scroll-mt-4">
          <Panel title={s.title} action={<RuleBadge rule={s.rule} />}>
            <p className="-mt-2 mb-3 text-[13px] text-muted">{s.desc}</p>
            <RelationList rows={s.rows} names={names} tables={known} empty={s.empty} />
          </Panel>
        </div>
      ))}

      <p className="rounded-xl bg-accent-soft/50 px-4 py-2.5 text-[13px] text-ink2">선호와 차단은 참가자가 직접 남긴 거라 운영자가 지우거나 바꿀 수 없어요. 신고를 잘못 닫았다면 아래에서 다시 열어 예외 처리함에서 새로 조치해요.</p>

      <Panel title="신고 기록">
        <p className="-mt-2 mb-3 text-[13px] text-muted">신고는 접수되는 순간부터 처리 결과와 상관없이 두 사람을 떨어뜨려요. 다시 열어도 떨어뜨리는 건 그대로예요.</p>
        <p className="text-[13px] font-semibold text-ink">받은 신고 <span className="font-normal text-muted">{got.length}건</span></p>
        {!got.length ? <p className="mt-1 text-[13px] text-muted">받은 신고가 없어요.</p> : <ul className="divide-y divide-line text-[14px]">{got.map((r) => <ReportRow key={r.id} r={r} other={r.reporter_id} dir="신고한 사람" />)}</ul>}
        <p className="mt-4 text-[13px] font-semibold text-ink">낸 신고 <span className="font-normal text-muted">{gave.length}건</span></p>
        {!gave.length ? <p className="mt-1 text-[13px] text-muted">낸 신고가 없어요.</p> : <ul className="divide-y divide-line text-[14px]">{gave.map((r) => <ReportRow key={r.id} r={r} other={r.reported_id} dir="신고받은 사람" />)}</ul>}
      </Panel>
    </div>
  );
}
