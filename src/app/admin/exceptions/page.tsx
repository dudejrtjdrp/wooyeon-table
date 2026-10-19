import { isClaimed } from "@/lib/attendance-rules";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { type MoveSuggestion, suggestMove } from "@/lib/admin-ops";
import { won } from "@/lib/constants";
import { fmtDateTime, fmtSlot } from "@/lib/format";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../confirm-button";
import { resolveException } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  payment: "결제 오류", refund: "자동 환불 실패", data_missing: "데이터 누락", condition_conflict: "조건 충돌",
  venue_shortage: "식당 부족", notification: "알림 발송 실패", no_show: "노쇼 후보", safety: "안전 신고", reservation: "식당 예약 실패",
};

// 처음 온 운영자도 바로 고를 수 있게, 건마다 누구·어디를 넣어 먼저 해 볼 일을 적는다
function adviceFor(e: { kind: string; ref_type: string; reason?: string | null }, c: Ctx, sug: MoveSuggestion | null | undefined): string | undefined {
  const who = c.who ?? "이 참가자";
  const where = c.where ? `${c.where} ` : "";
  switch (e.kind) {
    case "payment":
      return `${who}의 결제를 결제사 승인 내역에서 확인해 주세요. 결제가 됐으면 참가자에게 알리고, 안 됐으면 다시 결제하도록 안내한 뒤 '처리 완료'를 눌러요.`;
    case "refund":
      return `${who}${c.amount ? `의 ${c.amount}` : ""} 환불을 '환불 다시 요청'으로 먼저 해 보세요. 또 안 되면 결제사 관리 화면에서 직접 취소하고 '직접 처리함'을 눌러요.`;
    case "data_missing":
      return e.ref_type === "match_run"
        ? `${where}자동 매칭이 끝까지 돌지 못했어요. '관련 기록 보기'로 매칭 모니터의 실패 사유를 확인하고 개발 담당에게 다시 실행을 부탁한 뒤 '처리 완료'를 눌러요. 같은 회차를 다시 돌려도 테이블이 두 번 생기지 않아요.`
        : `${who}의 신청에서 빠진 정보를 신청자 상세에서 확인하고, 본인에게 연락해 채운 뒤 '처리 완료'를 눌러요. 채우기 전까지는 매칭에서 빠져 있어요.`;
    case "condition_conflict":
      return sug
        ? `${sug.name}님을 ${sug.target} 테이블(지금 ${sug.count}명)로 옮기면 나이 차·차단 조건을 지키면서 풀려요. 아래 '옮기기'를 누르고 확인하면 끝나요. 사유는 이 예외 내용으로 미리 채워 뒀어요.`
        : `같은 회차에 ${who}을(를) 받아 줄 수 있는 테이블이 없어요. '긴급 수정 열기'에서 테이블에서 빼거나(다른 일정·보관·환불 안내가 자동으로 가요) 테이블을 나눠 주세요. 고치면 이 예외도 함께 닫혀요.`;
    case "venue_shortage":
      return `식당에 자리가 있는지 확인했다면 '재고 1 늘리고 바로 배정'을 누르면 ${where.trim() || "그 일정"}에서 평점이 가장 높은 식당으로 배정돼요. 다른 식당을 쓰거나 제휴 식당이 없으면 '식당 재고 열기'에서 고쳐요.`;
    case "notification":
      return `${c.who ? `${who}에게 ` : ""}${where}안내가 나가지 않았어요. '다시 보내기'를 먼저 눌러 보세요. 그래도 안 되면 문자나 전화로 직접 알리고 '직접 연락함'을 눌러요.`;
    case "no_show":
      return e.ref_type === "user"
        ? `${who}은(는) 최근 90일 안에 노쇼가 세 번이에요. 소명이 있었으면 제한을 풀고, 없으면 영구 제한해요. 그 전까지 신청은 막혀 있어요.`
        : isClaimed(e.reason)
          ? `${who}이(가) 직접 '참석했는데 체크인을 못 했어요'라고 알렸어요. 단체방 대화와 같은 테이블 분들 체크인을 보고 맞으면 '참석으로 정정'을 눌러요. 정정하면 곧 후기 요청이 자동으로 가요.`
          : `${who}의 체크인 기록이 없어요. 테이블 단체방과 '늦을 것 같아요' 기록을 보고 고르세요. 노쇼로 확정하면 횟수에 따라 경고·신청 제한이 자동으로 걸려요.`;
    case "safety":
      return `신고 내용을 보고 조치를 골라요. 두 사람은 신고가 들어온 순간부터 같은 테이블에 앉지 않아요. 지금 같은 테이블이면 '긴급 수정 열기'에서 한 사람을 옮겨요.`;
    case "reservation":
      if (e.ref_type === "venue_cancel") return `${where}식당을 바꿔 이전 식당 예약이 남아 있어요. 식당에 전화해 취소한 뒤 '이전 예약 취소함'을 눌러요.`;
      if (e.ref_type === "venue_phone") return `${where}전화로만 예약되는 식당이에요. 전화로 예약하고, 예약번호를 메모에 적어 '직접 예약함'을 눌러요.`;
      return `${where}예약이 안 됐어요. '예약 다시 시도'를 먼저 눌러 보세요. 안 되면 예약 페이지에서 직접 예약하고, 예약번호를 메모에 적어 '직접 예약함'을 눌러요.`;
  }
  return undefined;
}

const TONE: Record<string, string> = { safety: "ring-danger/40", payment: "ring-accent/30", refund: "ring-accent/30", venue_shortage: "ring-warn/40", no_show: "ring-warn/40" };
const PILL: Record<string, string> = { safety: "bg-danger/10 text-danger", payment: "bg-accent-soft text-accent", refund: "bg-accent-soft text-accent", venue_shortage: "bg-warn-soft text-warn", no_show: "bg-warn-soft text-warn" };

const B = "h-10 rounded-xl px-4 text-[13px] font-semibold";
const primary = `${B} bg-accent text-white`;
const light = `${B} border border-accent/40 text-accent`;
const danger = `${B} bg-danger text-white`;
const dangerLight = `${B} border border-danger/50 bg-danger/5 text-danger`;

type Ctx = { who?: string; href?: string; where?: string; ops?: string; amount?: string; inventory?: string };

function since(iso: string, t: Date) {
  const min = Math.max(0, Math.round((t.getTime() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min}분째`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간째`;
  return `${Math.floor(min / 1440)}일째`;
}

export default async function Exceptions({ searchParams }: { searchParams: Promise<{ all?: string; k?: string }> }) {
  const me = await requireAdmin();
  const { all, k } = await searchParams;
  let q = db().from("exceptions").select("*").order("created_at", { ascending: !all }).limit(100);
  if (!all) q = q.eq("status", "open");
  const [{ data: rows }, t] = await Promise.all([q, now()]);
  const counts = new Map<string, number>();
  for (const e of rows ?? []) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  // 본인이 '참석했어요'라고 알린 노쇼 후보는 확인만 하면 끝나니 위로 올린다
  // 아직 열린 '본인 참석 알림' 노쇼 건을 맨 위로 (확인만 하면 끝나는 건)
  const claimedFirst = (e: { status: string; kind: string; reason: string | null }) => Number(e.status === "open" && e.kind === "no_show" && isClaimed(e.reason));
  const data = (k ? (rows ?? []).filter((e) => e.kind === k) : rows ?? []).sort((a, b) => claimedFirst(b) - claimedFirst(a));
  const qs = (kind?: string) => { const p = new URLSearchParams(); if (all) p.set("all", "1"); if (kind) p.set("k", kind); const x = p.toString(); return `/admin/exceptions${x ? `?${x}` : ""}`; };
  const back = qs(k);

  // 각 건의 '누구·어디'를 한 번에 읽는다
  const idsOf = (type: string) => data.filter((e) => e.ref_type === type).map((e) => e.ref_id);
  const reportIds = data.filter((e) => e.kind === "safety").map((e) => e.ref_id);
  const resolverIds = [...new Set(data.map((e) => e.resolved_by).filter(Boolean))] as string[];
  const [{ data: reports }, { data: apps }, { data: tbs }, { data: users }, { data: rooms }, { data: notes }, { data: resolvers }, { data: runs }] = await Promise.all([
    reportIds.length ? db().from("safety_reports").select("id,reason,detail,table_id,reported_id,reporter:users!safety_reports_reporter_id_fkey(name),reported:users!safety_reports_reported_id_fkey(name)").in("id", reportIds) : Promise.resolve({ data: [] }),
    idsOf("application").length ? db().from("applications").select("id,table_id,users(name),rounds(title),payments(amount)").in("id", idsOf("application")) : Promise.resolve({ data: [] }),
    idsOf("dining_table").length ? db().from("dining_tables").select("id,round_id,slots(starts_at,region),venues(name)").in("id", idsOf("dining_table")) : Promise.resolve({ data: [] }),
    idsOf("user").length ? db().from("users").select("id,name,applications(id,created_at)").in("id", idsOf("user")) : Promise.resolve({ data: [] }),
    idsOf("chat_room").length ? db().from("chat_rooms").select("id,table_id,dining_tables(slots(starts_at,region))").in("id", idsOf("chat_room")) : Promise.resolve({ data: [] }),
    idsOf("notification").length ? db().from("notifications").select("id,title,user_id,users(name)").in("id", idsOf("notification")) : Promise.resolve({ data: [] }),
    resolverIds.length ? db().from("users").select("id,name").in("id", resolverIds) : Promise.resolve({ data: [] }),
    idsOf("match_run").length ? db().from("match_runs").select("id,round_id,rounds(title)").in("id", idsOf("match_run")) : Promise.resolve({ data: [] }),
  ]);
  type Rep = { id: string; reason: string; detail: string | null; table_id: string | null; reported_id: string; reporter: { name: string }; reported: { name: string } };
  const repMap = new Map(((reports ?? []) as unknown as Rep[]).map((r) => [r.id, r]));
  const ctx = new Map<string, Ctx>();
  for (const a of (apps ?? []) as unknown as { id: string; table_id: string | null; users: { name: string }; rounds: { title: string }; payments: { amount: number } | null }[])
    ctx.set(`application:${a.id}`, { who: `${a.users.name}님`, href: `/admin/applicants/${a.id}`, where: a.rounds.title, ops: a.table_id ? `/admin/tables/${a.table_id}` : undefined, amount: a.payments?.amount ? won(a.payments.amount) : undefined });
  for (const x of (tbs ?? []) as unknown as { id: string; round_id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null }[])
    ctx.set(`dining_table:${x.id}`, { who: `${x.slots.region} 테이블`, href: `/admin/tables/${x.id}`, where: `${fmtSlot(x.slots.starts_at)}${x.venues ? ` · ${x.venues.name}` : ""}`, ops: `/admin/tables/${x.id}`, inventory: `/admin/rounds?r=${x.round_id}` });
  for (const x of (runs ?? []) as unknown as { id: string; round_id: string; rounds: { title: string } | null }[])
    ctx.set(`match_run:${x.id}`, { who: "자동 매칭 실행", href: `/admin/matching?r=${x.round_id}`, where: x.rounds?.title });
  for (const u of (users ?? []) as unknown as { id: string; name: string; applications: { id: string; created_at: string }[] }[]) {
    const last = [...(u.applications ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    ctx.set(`user:${u.id}`, { who: `${u.name}님`, href: last ? `/admin/applicants/${last.id}` : undefined });
  }
  for (const r of (rooms ?? []) as unknown as { id: string; table_id: string; dining_tables: { slots: { starts_at: string; region: string } } | null }[])
    ctx.set(`chat_room:${r.id}`, { who: "단체방 공지", href: `/admin/tables/${r.table_id}`, where: r.dining_tables ? `${fmtSlot(r.dining_tables.slots.starts_at)} ${r.dining_tables.slots.region}` : undefined });
  for (const n of (notes ?? []) as unknown as { id: string; title: string; users: { name: string } | null }[])
    ctx.set(`notification:${n.id}`, { who: n.users ? `${n.users.name}님` : undefined, href: "/admin/messages", where: `'${n.title}' 알림` });
  const resolverName = new Map(((resolvers ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const canAct = me.level === "full";
  // 조건 충돌은 서버에서 받아 줄 테이블을 미리 골라 둔다(필수 조건 canJoin 통과). 버튼 하나와 확인으로 끝나게
  const sugs = new Map<string, MoveSuggestion | null>();
  await Promise.all(data.filter((e) => e.kind === "condition_conflict" && e.status === "open").map(async (e) => sugs.set(e.id, await suggestMove(e).catch(() => null))));

  return (
    <div>
      <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">예외 처리함</h1>
      <p className="mt-1.5 text-[15px] text-muted">자동으로 풀지 못한 일만 모았어요. 오래된 것부터 보여 줘요. 각 건에 누구·무슨 일·왜·먼저 해 볼 일이 있고, 버튼 하나로 끝나요.</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={qs()} className={`rounded-full px-4 py-2 text-[15px] font-semibold ${!k ? "bg-accent-soft text-accent" : "border border-line bg-card text-ink/80"}`}>전체 {rows?.length ?? 0}</Link>
        {[...counts.entries()].map(([kind, n]) => (
          <Link key={kind} href={qs(kind)} className={`rounded-full px-4 py-2 text-[15px] ${k === kind ? "bg-accent-soft font-semibold text-accent" : "border border-line bg-card text-ink/80"}`}>{LABEL[kind] ?? "기타"} {n}</Link>
        ))}
        <Link href={all ? (k ? `/admin/exceptions?k=${k}` : "/admin/exceptions") : `/admin/exceptions?all=1${k ? `&k=${k}` : ""}`} className="ml-auto flex items-center gap-2 text-[14px] text-muted">
          <span className={`flex size-5 items-center justify-center rounded-md border-2 ${all ? "border-accent bg-accent text-white" : "border-line"}`}>{all ? "✓" : ""}</span>처리한 것까지 보기
        </Link>
      </div>

      {!data.length && (
        <div className="shadow-card mt-6 rounded-[20px] bg-card p-10 text-center">
          <p className="text-[17px] font-bold text-ink">{all ? "기록된 예외가 없어요" : "처리할 예외가 0건이에요"}</p>
          <p className="mt-1.5 text-[14px] text-muted">정상 흐름은 모두 자동으로 처리됐어요. 결제 오류·식당 부족·신고처럼 사람이 봐야 하는 일이 생기면 여기에 올라와요.</p>
          {!all && <Link href="/admin/exceptions?all=1" className="mt-4 inline-block text-[14px] font-semibold text-accent hover:underline">지난 처리 기록 보기</Link>}
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {data.map((e) => {
          const rep = e.kind === "safety" ? repMap.get(e.ref_id) : undefined;
          const c: Ctx = rep
            ? { who: `${rep.reported?.name}님 (신고한 사람 ${rep.reporter?.name}님)`, href: rep.table_id ? `/admin/tables/${rep.table_id}` : undefined, ops: rep.table_id ? `/admin/tables/${rep.table_id}` : undefined }
            : ctx.get(`${e.ref_type}:${e.ref_id}`) ?? {};
          const sug = sugs.get(e.id);
          const advice = adviceFor(e, c, sug);
          // 조건 충돌·데이터 누락은 긴급 수정으로 고치면 이 건도 닫힌다. 신고는 조치를 따로 골라야 하므로 테이블만 연다
          const opsHref = c.ops && ["condition_conflict", "data_missing"].includes(e.kind) ? `${c.ops}?ex=${e.id}#ops` : c.ops && e.kind === "safety" ? `${c.ops}#ops` : undefined;
          return (
            <li key={e.id} className={`shadow-card rounded-[20px] bg-card p-6 ring-1 ${e.status === "open" ? TONE[e.kind] ?? "ring-line" : "ring-line"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-[14px] font-semibold ${PILL[e.kind] ?? "bg-danger/10 text-danger"}`}>{LABEL[e.kind] ?? "기타 예외"}</span>
                {e.kind === "no_show" && isClaimed(e.reason) && <span className="rounded-full bg-accent-soft px-3 py-1 text-[14px] font-semibold text-accent">본인 참석 알림</span>}
                <span className="text-[14px] text-muted">{fmtDateTime(e.created_at)} 올라옴{e.status === "open" ? ` · ${since(e.created_at, t)}` : ""}</span>
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[15px] sm:grid-cols-[72px_1fr]">
                <dt className="text-[13px] font-semibold leading-6 text-muted">누구</dt>
                <dd className="text-ink">
                  {c.href ? <Link href={c.href} className="font-semibold text-accent hover:underline">{c.who ?? "관련 기록 보기"}</Link> : <span className="font-semibold">{c.who ?? "-"}</span>}
                  {c.where && <span className="ml-2 text-[13px] text-muted">{c.where}</span>}
                </dd>
                <dt className="text-[13px] font-semibold leading-6 text-muted">왜</dt>
                <dd className="font-semibold text-ink">
                  {e.reason}
                  {rep && <span className="mt-0.5 block text-[13px] font-normal text-muted">신고 사유: {rep.reason}{rep.detail ? ` · "${rep.detail}"` : ""}</span>}
                </dd>
                {e.status === "open" && advice && (
                  <>
                    <dt className="text-[13px] font-semibold leading-6 text-muted">먼저 할 일</dt>
                    <dd className="text-[14px] leading-relaxed text-ink/80">{advice}</dd>
                  </>
                )}
              </dl>
              {e.status === "resolved" && (
                <p className="mt-3 rounded-xl bg-leaf/10 px-3.5 py-2 text-[13px] text-leaf">
                  처리됨 · {e.resolution ?? "처리 완료"} · {e.resolved_by ? `운영자 ${resolverName.get(e.resolved_by) ?? ""}` : "자동"}{e.resolved_at ? ` · ${fmtDateTime(e.resolved_at)}` : ""}
                </p>
              )}
              {e.status === "open" && !canAct && <p className="mt-4 text-[13px] text-muted">조회 전용 계정이라 처리할 수 없어요.</p>}
              {e.status === "open" && canAct && (
                <form action={resolveException} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="back" value={back} />
                  <input name="note" aria-label="처리 메모" defaultValue={sug ? `조건 충돌 해소: ${e.reason}` : undefined} placeholder="처리 메모 (선택, 기록에 남아요)" className="h-10 min-w-48 flex-1 rounded-xl border border-line bg-field px-3.5 text-[14px] outline-none focus:border-accent" />
                  {opsHref && <Link href={opsHref} className={`${light} flex items-center`}>긴급 수정 열기</Link>}
                  {e.kind === "no_show" && e.ref_type === "user" ? (
                    <>
                      <ConfirmButton name="action" value="ban" confirm={`${c.who ?? "이 참가자"}를 영구 제한해요. 앞으로 신청할 수 없어요. 계속할까요?`} className={danger}>영구 제한</ConfirmButton>
                      <button name="action" value="lift" className={light}>소명 확인, 제한 풀기</button>
                    </>
                  ) : e.kind === "no_show" ? (
                    <>
                      <ConfirmButton name="action" value="noshow" confirm={`${c.who ?? "이 참가자"}를 노쇼로 확정해요. 노쇼 횟수에 따라 경고나 신청 제한이 바로 걸려요. 계속할까요?`} className={primary}>노쇼 확정</ConfirmButton>
                      <button name="action" value="attended" className={light}>참석으로 정정</button>
                    </>
                  ) : e.kind === "safety" ? (
                    <>
                      <button name="action" value="none" className={light}>조치 없음</button>
                      <ConfirmButton name="action" value="warning" confirm={`${rep?.reported?.name ?? "이 참가자"}님께 경고를 남겨요. 계정 상태가 경고로 바뀌고 처리 이력에 남아요. 계속할까요?`} className={light}>경고</ConfirmButton>
                      <ConfirmButton name="action" value="restricted" confirm={`${rep?.reported?.name ?? "이 참가자"}님의 참가를 제한해요. 운영자가 풀기 전까지 신청할 수 없어요. 계속할까요?`} className={dangerLight}>참가 제한</ConfirmButton>
                      <ConfirmButton name="action" value="banned" confirm={`${rep?.reported?.name ?? "이 참가자"}님을 영구 제한해요. 앞으로 신청할 수 없어요. 계속할까요?`} className={danger}>영구 제한</ConfirmButton>
                    </>
                  ) : e.kind === "refund" ? (
                    <>
                      <ConfirmButton name="action" value="retry_refund" confirm="결제사에 환불을 다시 요청해요. 승인되면 되돌릴 수 없어요. 계속할까요?" className={primary}>환불 다시 요청</ConfirmButton>
                      <button name="action" value="done" className={light}>직접 처리함</button>
                    </>
                  ) : e.kind === "reservation" && e.ref_type === "venue_cancel" ? (
                    <>
                      <Link href={`/admin/tables/${e.ref_id}#reservation`} className={`${B} flex items-center border border-line text-ink`}>테이블 보기</Link>
                      <button name="action" value="done" className={primary}>이전 예약 취소함</button>
                    </>
                  ) : e.kind === "reservation" && e.ref_type === "venue_phone" ? (
                    <>
                      <Link href={`/admin/tables/${e.ref_id}#reservation`} className={`${B} flex items-center border border-line text-ink`}>예약 정보 보기</Link>
                      <button name="action" value="reserved" className={primary}>직접 예약함</button>
                    </>
                  ) : e.kind === "reservation" ? (
                    <>
                      <Link href={`/admin/tables/${e.ref_id}#reservation`} className={`${B} flex items-center border border-line text-ink`}>예약 정보 보기</Link>
                      <button name="action" value="retry_reservation" className={primary}>예약 다시 시도</button>
                      <button name="action" value="reserved" className={light}>직접 예약함</button>
                    </>
                  ) : e.kind === "notification" && (e.ref_type === "chat_room" || e.ref_type === "notification") ? (
                    <>
                      <ConfirmButton name="action" value="resend" confirm="같은 안내를 참가자에게 한 번 더 보내요. 보낸 알림은 되돌릴 수 없어요. 계속할까요?" className={primary}>다시 보내기</ConfirmButton>
                      <button name="action" value="done" className={light}>직접 연락함</button>
                    </>
                  ) : e.kind === "condition_conflict" && sug ? (
                    <>
                      <input type="hidden" name="app_id" value={sug.appId} />
                      <input type="hidden" name="target_id" value={sug.targetId} />
                      <ConfirmButton name="action" value="move" confirm={`${sug.name}님을 ${sug.target} 테이블로 옮겨요. 두 테이블 단체방과 본인에게 바로 안내가 가요. 계속할까요?`} className={primary}>{sug.name}님을 {sug.target} 테이블로 옮기기</ConfirmButton>
                    </>
                  ) : e.kind === "venue_shortage" ? (
                    <>
                      <ConfirmButton name="action" value="add_and_retry" confirm="같은 지역에서 평점이 가장 높은 식당의 이 일정 테이블 수를 1 늘리고 바로 배정해요. 식당에 자리가 있는지 확인했나요?" className={primary}>재고 1 늘리고 바로 배정</ConfirmButton>
                      <button name="action" value="retry" className={light}>식당 다시 배정</button>
                      <Link href={c.inventory ?? "/admin/rounds"} className={`${B} flex items-center border border-line text-ink`}>식당 재고 열기</Link>
                      <button name="action" value="done" className={light}>직접 처리함</button>
                    </>
                  ) : (
                    <button name="action" value="done" className={primary}>처리 완료</button>
                  )}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
