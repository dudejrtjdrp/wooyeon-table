import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Panel, btnLight, ctl, td, th } from "@/components/admin-ui";
import { Required } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { now } from "@/lib/clock";
import { LEGACY_PASS_LABEL, PASSES, isMembership, won } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtSlot } from "@/lib/format";
import { ACCOUNT, ATTEND, MATCH, PAYMENT, actorLabel, eventText, label } from "@/lib/labels";
import { maskLoginId, maskPhone } from "@/lib/members";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../../confirm-button";
import { setAccountStatus } from "../../applicants/[id]/actions";

export const dynamic = "force-dynamic";

type Profile = { birth_year: number; gender: string; mbti: string | null; job: string | null; interests: string[]; my_traits: string[]; wanted_traits: string[]; price_range: string | null; food_restrictions: string | null };
type User = {
  id: string; name: string; login_id: string; phone: string | null; email: string | null; role: string; account_status: string; restricted_until: string | null;
  created_at: string; deleted_at: string | null; phone_verified_at: string | null; profiles: Profile | Profile[] | null;
};
type App = {
  id: string; application_status: string; payment_status: string; match_status: string; attendance_status: string | null; submitted_at: string | null; created_at: string;
  rounds: { title: string }; dining_tables: { slots: { starts_at: string; region: string } } | null;
};
type Pay = { id: string; amount: number; status: string; provider: string; pass_type: string | null; paid_at: string | null; refunded_at: string | null; created_at: string; refund_error: string | null };
type Pass = { id: string; pass_type: string; remaining: number; total_count: number; expires_at: string | null; created_at: string };
type Report = { id: string; reason: string; status: string; action: string | null; created_at: string };

const passName = (t: string | null) => (t && (PASSES[t as keyof typeof PASSES]?.label ?? LEGACY_PASS_LABEL[t])) || "-";
const ACTION: Record<string, string> = { none: "조치 없음", warning: "경고", restricted: "참가 제한", banned: "영구 제한" };

export default async function MemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const { data } = await db()
    .from("users")
    .select("id,name,login_id,phone,email,role,account_status,restricted_until,created_at,deleted_at,phone_verified_at,profiles(*)")
    .eq("id", id)
    .maybeSingle();
  const u = data as unknown as User | null;
  if (!u || u.role !== "user") notFound();
  const p = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
  const t = await now();

  const [{ data: appsRaw }, { data: paysRaw }, { data: passesRaw }, { data: repsRaw }, { count: reportedByMe }, { data: events }, { data: ids }] = await Promise.all([
    db().from("applications").select("id,application_status,payment_status,match_status,attendance_status,submitted_at,created_at,rounds(title),dining_tables(slots(starts_at,region))").eq("user_id", id).order("created_at", { ascending: false }),
    db().from("payments").select("id,amount,status,provider,pass_type,paid_at,refunded_at,created_at,refund_error").eq("user_id", id).order("created_at", { ascending: false }),
    db().from("passes").select("id,pass_type,remaining,total_count,expires_at,created_at").eq("user_id", id).order("created_at", { ascending: false }),
    db().from("safety_reports").select("id,reason,status,action,created_at").eq("reported_id", id).order("created_at", { ascending: false }),
    db().from("safety_reports").select("id", { count: "exact", head: true }).eq("reporter_id", id),
    db().from("status_events").select("id,entity_type,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "user").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    db().from("user_identities").select("provider").eq("user_id", id),
  ]);
  const apps = (appsRaw ?? []) as unknown as App[];
  const pays = (paysRaw ?? []) as unknown as Pay[];
  const passes = (passesRaw ?? []) as unknown as Pass[];
  const reps = (repsRaw ?? []) as unknown as Report[];
  const { data: extendsRaw } = passes.length
    ? await db().from("status_events").select("entity_id,from_value,to_value").eq("entity_type", "pass").eq("field", "expires_at").in("entity_id", passes.map((x) => x.id))
    : { data: [] };
  const extendN = new Map<string, number>();
  // 기한이 늘어난 기록만 센다 (멤버십 환불로 끝낸 기록은 빼고)
  for (const e of extendsRaw ?? []) if (e.from_value && e.to_value > e.from_value) extendN.set(e.entity_id, (extendN.get(e.entity_id) ?? 0) + 1);
  const adminIds = [...new Set((events ?? []).filter((e) => e.actor.startsWith("admin:")).map((e) => e.actor.slice(6)))];
  const { data: admins } = adminIds.length ? await db().from("users").select("id,name").in("id", adminIds) : { data: [] };
  const adminName = new Map((admins ?? []).map((x) => [x.id, x.name]));

  const attended = apps.filter((a) => a.attendance_status === "ATTENDED").length;
  const noShows = apps.filter((a) => a.attendance_status === "NO_SHOW").length;
  const canceled = apps.filter((a) => a.application_status === "CANCELED" || a.attendance_status?.startsWith("CANCELED")).length;
  const livePasses = passes.filter((x) => !x.expires_at || new Date(x.expires_at) > t);
  const back = `/admin/members/${u.id}`;

  return (
    <div>
      <p className="text-[14px] text-muted"><Link href="/admin/members" className="hover:text-ink">회원 찾기</Link> / {u.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">{u.name}님</h1>
        <Badge v={label(ACCOUNT, u.account_status)} />
        {u.deleted_at && <Badge v={["탈퇴", "muted"]} />}
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {fmtDate(u.created_at)} 가입 · 신청 {apps.length}건 · 참석 {attended}번{noShows ? ` · 노쇼 ${noShows}번` : ""}{canceled ? ` · 취소 ${canceled}건` : ""}
      </p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="신청·참석 이력">
            {!apps.length ? <p className="text-[14px] text-muted">아직 신청한 적이 없어요.</p> : (
              <ul className="divide-y divide-line">
                {apps.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/applicants/${a.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-[14px] hover:bg-paper/60">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{a.rounds.title}</span>
                        <span className="block text-[12px] text-muted">
                          {a.dining_tables ? `${fmtSlot(a.dining_tables.slots.starts_at)} · ${a.dining_tables.slots.region}` : a.submitted_at ? `${fmtDateTime(a.submitted_at)} 신청` : "작성 중"}
                        </span>
                      </span>
                      <Badge v={label(PAYMENT, a.payment_status)} />
                      {a.application_status === "CANCELED" ? <Badge v={["신청 취소", "muted"]} /> : <Badge v={label(MATCH, a.match_status)} />}
                      {a.attendance_status && <Badge v={label(ATTEND, a.attendance_status)} />}
                      <ChevronRight size={18} className="text-muted" aria-label="신청 상세·취소" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {apps.length > 0 && <p className="mt-2 text-[13px] text-muted">신청을 누르면 상태 이력을 보고, 필요하면 대신 취소할 수 있어요.</p>}
          </Panel>

          <Panel title="결제 이력">
            {!pays.length ? <p className="text-[14px] text-muted">결제한 적이 없어요.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead><tr>{["시각", "이용권", "금액", "상태", "환불 시각"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {pays.map((x) => (
                      <tr key={x.id}>
                        <td className={`${td} text-muted`}>{fmtDateTime(x.paid_at ?? x.created_at)}</td>
                        <td className={td}>{x.provider === "pass" ? "보유 이용권 사용" : passName(x.pass_type)}</td>
                        <td className={`${td} tabular-nums`}>{won(x.amount)}</td>
                        <td className={td}><Badge v={label(PAYMENT, x.status)} />{x.refund_error && <p className="mt-0.5 text-[12px] text-danger">{x.refund_error}</p>}</td>
                        <td className={`${td} text-muted`}>{x.refunded_at ? fmtDateTime(x.refunded_at) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Link href={`/admin/payments?q=${encodeURIComponent(u.name)}`} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline">결제·환불 화면에서 보기</Link>
          </Panel>

          <Panel title="받은 신고">
            {!reps.length ? <p className="text-[14px] text-muted">받은 신고가 없어요.</p> : (
              <ul className="space-y-2 text-[14px]">
                {reps.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-muted">{fmtDate(r.created_at)}</span>
                    <span className="min-w-0 flex-1 text-ink">{r.reason}</span>
                    <Badge v={r.status === "open" ? ["검토 전", "danger"] : [ACTION[r.action ?? "none"] ?? "검토 끝", "muted"]} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[13px] text-muted">이 회원이 낸 신고 {reportedByMe ?? 0}건</p>
          </Panel>

          <Panel title="계정 상태 이력">
            {!events?.length ? <p className="text-[14px] text-muted">바뀐 적이 없어요.</p> : (
              <ol className="space-y-2.5">
                {events.map((e) => (
                  <li key={e.id} className="grid grid-cols-[140px_90px_1fr] items-start gap-3 text-[14px]">
                    <span className="tabular-nums text-muted">{fmtDateTime(e.created_at)}</span>
                    <span className="text-muted">{actorLabel(e.actor, adminName)}</span>
                    <span className="text-ink">{eventText(e)}{e.reason && <span className="block text-[12px] text-muted">{e.reason}</span>}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="프로필">
            <dl className="space-y-2.5 text-[14px] text-ink">
              {[
                ["로그인 ID", maskLoginId(u.login_id)],
                ["로그인", (ids ?? []).map((i) => ({ kakao: "카카오", naver: "네이버", google: "Google" })[i.provider as "kakao"]).join(", ") || "휴대폰 번호"],
                ["연락처", <span key="ph" className="flex items-center gap-2">{maskPhone(u.phone)}{u.phone_verified_at && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">인증 완료</span>}</span>],
                ["프로필", p ? `${p.birth_year}년생 ${p.gender === "M" ? "남" : "여"}${p.mbti ? `, ${p.mbti}` : ""}` : "아직 안 만들었어요"],
                ["하는 일", p?.job ?? "-"],
                ["관심사", p?.interests?.join(", ") || "-"],
                ["못 먹는 음식", p?.food_restrictions ?? "없음"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="이용권·멤버십">
            {!passes.length ? <p className="text-[14px] text-muted">가진 이용권이 없어요.</p> : (
              <ul className="space-y-2.5 text-[14px]">
                {passes.map((x) => {
                  const live = livePasses.includes(x);
                  const member = isMembership(x.pass_type);
                  return (
                    <li key={x.id} className="rounded-xl bg-field px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{passName(x.pass_type)}</span>
                        <Badge v={!live ? ["기한 지남", "muted"] : member || x.remaining > 0 ? ["쓸 수 있음", "leaf"] : ["다 씀", "muted"]} />
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {member ? "횟수 제한 없음" : `남은 횟수 ${x.remaining}/${x.total_count}회`}
                        {x.expires_at ? ` · ${fmtDate(x.expires_at)}까지` : ""}
                        {extendN.get(x.id) ? ` · 기한 연장 ${extendN.get(x.id)}번` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="계정 조치">
            {u.restricted_until && u.account_status === "restricted" && (
              <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">{fmtDateTime(u.restricted_until)}까지 신청이 막혀 있어요.</p>
            )}
            {me.level !== "full" ? <p className="text-[13px] text-muted">조회 전용 계정이라 계정 상태를 바꿀 수 없어요.</p> : (
              <form action={setAccountStatus} className="space-y-3">
                <input type="hidden" name="user_id" value={u.id} />
                <input type="hidden" name="back" value={back} />
                <label className="flex items-center gap-3 text-[14px] text-muted">
                  <span className="w-20 shrink-0">계정 상태<Required /></span>
                  <select name="to" defaultValue={u.account_status} className={`${ctl} w-full`}>
                    {Object.entries(ACCOUNT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <label className="flex items-start gap-3 text-[14px] text-muted">
                  <span className="w-20 shrink-0 pt-2.5">사유<Required /></span>
                  <textarea name="note" rows={3} required minLength={4} placeholder="사유를 적어 주세요 (상태 이력에 남아요)" className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-accent" />
                </label>
                <ConfirmButton confirm="계정 상태를 바꾸면 참가 제한·영구 제한은 바로 신청을 막고, 상태 이력에 남아요. 계속할까요?" className={`${btnLight} w-full`}>상태 바꾸기</ConfirmButton>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
