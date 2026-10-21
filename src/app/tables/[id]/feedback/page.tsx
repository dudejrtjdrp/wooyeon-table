import Link from "next/link";
import { afterMeetingNote, canClaimAttended } from "@/lib/attendance-rules";
import { now } from "@/lib/clock";
import { redirect } from "next/navigation";
import { ChevronDown, Lock } from "lucide-react";
import { ConfirmSubmit, CountedTextarea, ErrorText, Optional, PageTitle, PrimaryButton, Required, Screen, SectionCard, StarRating, inputCls } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { FEEDBACK_SCORES, parseMissing } from "@/lib/feedback-rules";
import { db } from "@/lib/supabase";
import { report, submitFeedback } from "./actions";

const REASONS = ["불쾌한 말이나 행동", "약속 시간 무시·무단 이탈", "원치 않는 연락", "그 밖의 문제"];

export default async function Feedback({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const { id } = await params;
  const sp = await searchParams;
  const { e } = sp;
  // 별점을 덜 고르고 보냈다가 돌아온 경우: 빠진 줄 표시, 고른 값은 다시 채운다
  const miss = new Set(parseMissing(sp.miss));
  const { data: mine } = await db().from("applications").select("id,attendance_status").eq("table_id", id).eq("user_id", me.id).maybeSingle();
  if (!mine) redirect("/");
  // 후기는 체크인한(참석한) 사람만 남길 수 있다: 폼을 다 채운 뒤 막히지 않게 먼저 알려 준다 (안내 문장은 신청 상세와 같다).
  // 막는 건 후기 폼뿐이다. 아래 신고하기는 참석 여부와 상관없이 늘 열려 있어야 한다(단체방 '신고하기'가 여기로 온다)
  const blocked = mine.attendance_status !== "ATTENDED";
  let note: { text: string; contact: boolean } | null = null;
  if (blocked) {
    const { data: tb } = await db().from("dining_tables").select("status,slots(ends_at)").eq("id", id).maybeSingle();
    const tt = tb as unknown as { status: string; slots: { ends_at: string } } | null;
    const ended = tt?.status === "DONE";
    const claimed = Boolean((await db().from("status_events").select("id").eq("entity_id", mine.id).eq("field", "attendance_claim").limit(1)).data?.length);
    note = ended && tt ? afterMeetingNote({ attended: false, canClaim: canClaimAttended(mine.attendance_status, new Date(tt.slots.ends_at), await now()), claimed, status: mine.attendance_status }) : null;
  }
  const { data: fb } = await db().from("feedbacks").select("*").eq("application_id", mine.id).maybeSingle();
  const { data: othersRaw } = await db().from("applications").select("user_id,users(name,profiles(job))").eq("table_id", id).neq("user_id", me.id);
  const others = (othersRaw ?? []) as unknown as { user_id: string; users: { name: string; profiles: { job: string | null } | null } }[];
  const { data: prefs } = await db().from("person_prefs").select("to_user,pref").eq("from_user", me.id).eq("table_id", id);
  const prefMap = new Map((prefs ?? []).map((p) => [p.to_user, p.pref]));

  const AV = ["bg-accent-soft text-accent-text", "bg-[#CFE3D8] text-accent-text", "bg-[#EEF1EF] text-ink2", "bg-[#FDF3D2] text-[#6b5410]"];
  const ta = "w-full resize-none rounded-[14px] border border-line bg-field px-4 pt-3.5 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent focus:bg-card";
  return (
    <Screen title="오늘 저녁 돌아보기" back={`/tables/${id}`}>
      {blocked ? (
        <>
          <PageTitle className="mt-4" title="별점은 참석한 분만" accent="남길 수 있어요" sub={note ? note.text : "모임이 끝나면 체크인한 분이 별점을 남길 수 있어요."} />
          <p className="mt-4 text-[13px] text-muted">불편한 일이 있었다면 참석 여부와 상관없이 아래에서 신고할 수 있어요.</p>
          <div className="mt-6 flex flex-col gap-2">
            {note?.contact ? (
              <Link href="/help" className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[16px] font-extrabold text-white">문의하기</Link>
            ) : (
              <Link href={`/tables/${id}`} className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[16px] font-extrabold text-white">모임 정보 보기</Link>
            )}
          </div>
        </>
      ) : (
      <>
      <PageTitle className="mt-4" title="함께한 저녁," accent="어땠어요?" sub="별 다섯 개만 누르면 끝나요. 같이 앉은 분에 대한 선택은 다음 테이블을 꾸릴 때 반영하고, 식당 점수는 다음 일정 추천에 써요." />
      <p className="mt-5 flex items-center gap-2.5 rounded-[14px] bg-field px-4 py-3.5 text-[14px] text-ink2"><Lock size={17} className="shrink-0 text-accent" />다른 참가자에게는 보이지 않아요.</p>

      <form action={submitFeedback} className="mt-5 space-y-3">
        <input type="hidden" name="table_id" value={id} />
        <div id="scores" className="scroll-mt-16">
          <SectionCard title="별점 다섯 개" required>
            {miss.size > 0 && e && <div className="mb-2"><ErrorText msg={e} /></div>}
            <div className="-my-2 divide-y divide-line">
              {FEEDBACK_SCORES.map((f) => (
                <StarRating key={f.name} name={f.name} label={f.label} required invalid={miss.has(f.name)} value={Number(sp[`s_${f.name}`]) || fb?.[f.column]} />
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="같이 앉은 분들은 어땠어요?" optional hint="고르면 다음 테이블을 꾸릴 때 참고해요. '다시는 싫어요'를 고르면 앞으로 같은 테이블에 앉지 않아요.">
          <ul className="divide-y divide-line">
            {others.map((o, i) => (
              <li key={o.user_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className={`flex size-11 items-center justify-center rounded-full text-[17px] font-bold ${AV[i % AV.length]}`}>{o.users.name.slice(-2, -1) || o.users.name.slice(0, 1)}</span>
                  <span>
                    <span className="block text-[16px] font-bold text-ink">{o.users.name}</span>
                    {o.users.profiles?.job && <span className="block text-[13px] text-muted">{o.users.profiles.job}</span>}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[["again", "또 만나고 싶어요"], ["", "괜찮아요"], ["avoid", "다시는 싫어요"]].map(([v, l]) => (
                    <label key={v} className="cursor-pointer">
                      <input type="radio" name={`pref_${o.user_id}`} value={v} defaultChecked={(prefMap.get(o.user_id) ?? "") === v} className="peer sr-only" />
                      <span className="flex h-11 items-center justify-center rounded-[22px] bg-row text-[14px] font-semibold text-ink2 transition peer-checked:bg-accent peer-checked:font-extrabold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{l}</span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="더 하고 싶은 말" optional>
          <CountedTextarea name="comment" max={500} defaultValue={fb?.comment ?? ""} rows={4} placeholder="편하게 이야기할 수 있어서 좋았어요." className={ta} />
          <div className="mt-4"><PrimaryButton type="submit" pendingText="보내는 중">다음 테이블에 반영하기</PrimaryButton></div>
        </SectionCard>
      </form>
      </>
      )}

      <section id="report" className="mt-10 scroll-mt-16 border-t border-line pt-8">
        <h2 className="text-[20px] font-extrabold text-ink">불편한 일이 있었나요?</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">별점과 따로 접수돼요. 상대에게는 알리지 않고, 신고하면 바로 같은 테이블에 앉지 않게 막아요.</p>
        <form action={report} className="mt-5 space-y-5">
          <input type="hidden" name="table_id" value={id} />
          <div>
            <p className="text-[16px] font-bold text-ink">신고 대상<Required /></p>
            <div className="relative mt-2.5">
              <select name="target" defaultValue="" required className={`${inputCls} appearance-none pr-12`}>
                <option value="" disabled>대상을 선택해 주세요.</option>
                {others.map((o) => (
                  <option key={o.user_id} value={o.user_id}>{o.users.name}</option>
                ))}
              </select>
              <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </div>
          <div>
            <p className="text-[16px] font-bold text-ink">신고 사유<Required /></p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <label key={r} className="cursor-pointer">
                  <input type="radio" name="reason" value={r} required className="peer sr-only" />
                  <span className="flex min-h-12 items-center justify-center rounded-[14px] bg-row px-2 text-center text-[14px] text-ink transition peer-checked:bg-danger/10 peer-checked:font-extrabold peer-checked:text-danger peer-focus-visible:ring-2 peer-focus-visible:ring-danger">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[16px] font-bold text-ink">설명<Optional /></p>
            <div className="mt-2.5"><CountedTextarea name="detail" max={500} rows={3} placeholder="필요한 내용을 적어 주세요." className={ta} /></div>
          </div>
          {miss.size === 0 && <ErrorText msg={e} />}
          <ConfirmSubmit label="신고하고 차단하기" question="신고하면 이 분과는 다시 같은 테이블에 앉지 않아요. 상대에게는 알리지 않고, 운영팀이 내용을 확인해요." confirmLabel="신고하기" />
        </form>
      </section>
    </Screen>
  );
}
