import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Panel, btnDanger, btnLight, btnPrimary, ctl } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { fmtDateTime } from "@/lib/format";
import { toKstInput } from "@/lib/round-rules";
import { SCHEDULED_BODY_MAX, SCHEDULED_LABEL, SCHEDULED_TITLE_MAX, keyKind } from "@/lib/scheduled-rules";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../../../confirm-button";
import { cancelScheduledNotice, editScheduled } from "../../actions";
import { MessagesHeader } from "../../header";

export const dynamic = "force-dynamic";

const STATE: Record<string, [string, "muted" | "leaf" | "danger" | "ink"]> = { pending: ["보낼 예정", "muted"], sent: ["보냄", "leaf"], failed: ["실패", "danger"], canceled: ["취소됨", "ink"] };

/** 자동 메시지 › 예약된 알림 한 건: 고치기·취소, 바뀐 이력 */
export default async function ScheduledNotice({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const ro = me.level !== "full";
  const { id } = await params;
  const { data } = await db().from("notifications").select("id,user_id,template,title,body,link,status,scheduled_at,sent_at,last_error,dedupe_key,users(name)").eq("id", id).maybeSingle();
  const n = data as unknown as { id: string; user_id: string; template: string; title: string; body: string; link: string | null; status: string; scheduled_at: string; sent_at: string | null; last_error: string | null; dedupe_key: string | null; users: { name: string } | null } | null;
  if (!n) notFound();
  const [t, { data: ev }] = await Promise.all([
    now(),
    db().from("status_events").select("id,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "notification").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const { kind, appId } = keyKind(n.dedupe_key);
  const pending = n.status === "pending";
  const edited = (ev ?? []).some((e) => e.field === "scheduled_edit");
  const [label, tone] = STATE[n.status] ?? [n.status, "muted"];

  return (
    <div>
      <MessagesHeader
        current="/admin/messages"
        desc="아직 나가지 않은 예약 알림이에요. 문구·보낼 시각을 고치거나 보내지 않게 취소할 수 있어요."
        how={["고칠 칸을 바꾸고 사유를 적어 '고치기'", "보내면 안 되면 사유를 적어 '예약 취소'", "참석 취소·테이블 해제·이동이 생기면 자동으로 정리돼요"]}
      />
      <p className="mt-4 text-[14px]"><Link href="/admin/messages?st=pending#log" className="text-muted hover:text-ink">← 예약된 알림 목록</Link></p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title={pending ? "예약 고치기" : "알림 내용"} action={<Badge v={[label, tone]} />}>
          <dl className="mb-4 grid grid-cols-[88px_1fr] gap-y-1.5 text-[14px]">
            <dt className="text-muted">받는 사람</dt>
            <dd className="text-ink">{n.users?.name ?? "-"}</dd>
            <dt className="text-muted">종류</dt>
            <dd>{SCHEDULED_LABEL[kind]}{edited && <span className="ml-2 text-[13px] text-muted">(운영자가 고친 문구)</span>}</dd>
            <dt className="text-muted">{pending ? "보낼 시각" : n.status === "sent" ? "보낸 시각" : "예약 시각"}</dt>
            <dd>{fmtDateTime(n.sent_at ?? n.scheduled_at)}{pending && Date.parse(n.scheduled_at) <= t.getTime() && <span className="ml-2 text-[13px] text-muted">곧 나가요</span>}</dd>
            {n.link && (<><dt className="text-muted">누르면</dt><dd className="break-all text-muted">{n.link}</dd></>)}
            {appId && (<><dt className="text-muted">신청</dt><dd><Link href={`/admin/applicants/${appId}`} className="text-accent hover:underline">신청자 상세 보기</Link></dd></>)}
            {n.status === "canceled" && n.last_error && (<><dt className="text-muted">취소 사유</dt><dd>{n.last_error.replace(/^취소: /, "")}</dd></>)}
          </dl>
          {pending && !ro ? (
            <form action={editScheduled} className="space-y-3">
              <input type="hidden" name="id" value={n.id} />
              <label className="block text-[13px] text-muted">제목<input name="title" defaultValue={n.title} maxLength={SCHEDULED_TITLE_MAX} required className={`${ctl} mt-1 block w-full`} /></label>
              <label className="block text-[13px] text-muted">본문<textarea name="body" defaultValue={n.body} maxLength={SCHEDULED_BODY_MAX} required rows={4} className={`${ctl} mt-1 block h-auto w-full py-2.5 leading-relaxed`} /></label>
              <label className="block text-[13px] text-muted">보낼 시각(서울)<input type="datetime-local" name="at" defaultValue={toKstInput(n.scheduled_at)} required className={`${ctl} mt-1 block w-full max-w-[260px]`} /></label>
              <label className="block text-[13px] text-muted">고치는 사유<input name="reason" placeholder="예: 식당 주차 안내 추가" minLength={4} required className={`${ctl} mt-1 block w-full`} /></label>
              {kind === "remind" && <p className="text-[13px] leading-relaxed text-muted">하루 전 안내는 원래 보낼 때 지금 식당·예약명으로 다시 써요. 여기서 고치면 고친 문구 그대로 나가고, 테이블이 바뀌면 링크만 따라가요.</p>}
              <button className={btnPrimary}>고치기</button>
            </form>
          ) : (
            <div className="rounded-xl bg-paper p-4">
              <p className="font-semibold text-ink">{n.title}</p>
              <p className="mt-1 whitespace-pre-line text-[14px] text-muted">{n.body}</p>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {pending && !ro && (
            <Panel title="예약 취소">
              <form action={cancelScheduledNotice} className="space-y-3">
                <input type="hidden" name="id" value={n.id} />
                <label className="block text-[13px] text-muted">취소 사유<input name="reason" placeholder="예: 전화로 따로 안내함" minLength={4} required className={`${ctl} mt-1 block w-full`} /></label>
                <ConfirmButton confirm={`${n.users?.name ?? "받는 분"}님께 '${n.title}' 알림을 보내지 않을까요? 되돌릴 수 없어요`} className={btnDanger}>예약 취소</ConfirmButton>
              </form>
            </Panel>
          )}
          <Panel title="바뀐 이력">
            {ev?.length ? (
              <ul className="space-y-2.5 text-[13px]">
                {ev.map((e) => (
                  <li key={e.id}>
                    <p className="text-muted">{fmtDateTime(e.created_at)} · {e.actor.startsWith("admin:") ? "운영자" : e.actor === "system" ? "자동" : "참가자"}</p>
                    <p className="text-ink">{e.reason ?? `${e.field}: ${e.to_value}`}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">아직 바뀐 적 없어요.</p>
            )}
            <Link href="/admin/messages?st=canceled#log" className={`${btnLight} mt-4 h-9 px-3 text-[13px]`}>취소된 예약 보기</Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
