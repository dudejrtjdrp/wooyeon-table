import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { ErrorText } from "@/components/ui";
import { BackButton } from "@/components/client";
import { requireProfile } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDate, fmtTime } from "@/lib/format";
import { autoKeepAt, joinOptions, loadApp, moveOptions, waitDeadline } from "@/lib/resolve";
import { db } from "@/lib/supabase";
import { join, keepPass, refund, transfer, wait } from "./actions";
import { ResolveChoice } from "./picker";

export const dynamic = "force-dynamic";

/** E12 매칭 실패: 빈자리 합류 / 다른 일정으로 옮기기 / 자리 나면 알려 주기 / 이용권 보관 / 환불 */
export default async function Resolve({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const { e } = await searchParams;
  const { data } = await db().from("applications").select("id,user_id,match_status,match_reason").eq("id", id).maybeSingle();
  if (!data || data.user_id !== me.id) redirect("/");
  if (data.match_status !== "ALTERNATIVE_OFFERED") redirect(`/applications/${id}`);
  const app = (await loadApp(id))!;
  const t = await now();

  // 생각해 둔 순서: 바로 앉을 자리 → 다른 일정(고른 동네 → 옆 동네 → 조금 먼 동네) → 기다리기 → 보관·환불
  const [joins, moves, keepAt] = await Promise.all([joinOptions(app), moveOptions(app), autoKeepAt(id)]);
  const waitUntil = waitDeadline(app, t);
  const reason = data.match_reason ?? "고른 동네에서 4명이 안 모였어요.";
  const iso = (d: Date) => d.toISOString();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <div className="pt-safe px-3"><div className="flex h-[52px] items-center"><BackButton href={`/applications/${id}`} /></div></div>
      <div className="flex items-start gap-4 px-6 pt-2">
        <div className="flex-1">
          <h1 className="text-[25px] font-extrabold leading-[1.38]">이번엔 테이블을<br />못 만들었어요</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{reason}</p>
        </div>
        <RoundTable size={84} filled={3} me label="세 자리만 찬 테이블" />
      </div>
      {app.resolution === "wait" && app.wait_until ? (
        <p className="mx-6 mt-4 rounded-[14px] bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-text">
          지금 자리를 기다리는 중이에요. {fmtDate(app.wait_until)} {fmtTime(app.wait_until)}까지 자리가 없으면 이용권으로 보관해 드려요. 그 전에 다른 방법으로 바꿔도 돼요.
        </p>
      ) : keepAt ? (
        <p className="mx-6 mt-4 rounded-[14px] bg-field px-4 py-3 text-[13px] leading-relaxed text-ink2">
          {fmtDate(iso(keepAt))} {fmtTime(iso(keepAt))}까지 고르지 않으면 이용권으로 보관해 드려요. 결제한 금액은 그대로 남아요.
        </p>
      ) : null}
      <div className="px-6"><ErrorText msg={e} /></div>
      <ResolveChoice
        appId={app.id}
        joins={joins.map((j) => ({ id: j.tableId, label: `${fmtDate(j.startsAt)} ${fmtTime(j.startsAt)} · ${j.region}`, note: `${j.members}명 모였어요${j.venue ? ` · ${j.venue}` : ""}`, tag: j.tag }))}
        moves={moves.map((o) => ({ id: o.id, label: o.label, note: o.note, tag: o.tag, hot: o.hot }))}
        waitUntil={waitUntil && app.resolution !== "wait" ? `${fmtDate(iso(waitUntil))} ${fmtTime(iso(waitUntil))}` : null}
        nearOk={Boolean(app.near_ok)}
        actions={{ join, transfer, wait, keepPass, refund }}
      />
    </div>
  );
}
