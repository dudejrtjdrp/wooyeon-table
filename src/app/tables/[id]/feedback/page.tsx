import { redirect } from "next/navigation";
import { ErrorText, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { report, submitFeedback } from "./actions";

function Stars({ name, label, value }: { name: string; label: string; value?: number | null }) {
  return (
    <div>
      <p className="text-[14px] font-medium">{label}</p>
      <div className="mt-2 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex-1 cursor-pointer">
            <input type="radio" name={name} value={n} defaultChecked={value === n} className="peer sr-only" />
            <span className="block rounded-lg border border-line bg-card py-2 text-center text-[15px] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">{n}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const REASONS = ["불쾌한 말이나 행동", "약속 시간 무시·무단 이탈", "원치 않는 연락", "그 밖의 문제"];

export default async function Feedback({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { e } = await searchParams;
  const { data: mine } = await db().from("applications").select("id").eq("table_id", id).eq("user_id", me.id).maybeSingle();
  if (!mine) redirect("/");
  const { data: fb } = await db().from("feedbacks").select("*").eq("application_id", mine.id).maybeSingle();
  const { data: othersRaw } = await db().from("applications").select("user_id,users(name)").eq("table_id", id).neq("user_id", me.id);
  const others = (othersRaw ?? []) as unknown as { user_id: string; users: { name: string } }[];
  const { data: prefs } = await db().from("person_prefs").select("to_user,pref").eq("from_user", me.id).eq("table_id", id);
  const prefMap = new Map((prefs ?? []).map((p) => [p.to_user, p.pref]));

  return (
    <Screen title="모임 후기" back={`/tables/${id}`}>
      <p className="text-[15px] text-muted">남겨 주신 내용은 다른 참가자에게 보이지 않아요. 다음 테이블을 꾸릴 때만 써요.</p>
      <form action={submitFeedback} className="mt-6 space-y-6">
        <input type="hidden" name="table_id" value={id} />
        <Stars name="mood" label="테이블 분위기는 어땠어요?" value={fb?.mood_score} />
        <Stars name="talk" label="대화는 잘 통했나요?" value={fb?.talk_score} />
        <Stars name="venue" label="식당은 괜찮았나요?" value={fb?.venue_score} />
        <Stars name="rejoin" label="또 참여하고 싶어요" value={fb?.rejoin_intent} />
        <Stars name="recommend" label="친구에게 추천하고 싶어요" value={fb?.recommend_intent} />

        <div>
          <p className="text-[14px] font-medium">오늘 만난 분들</p>
          <p className="text-[12px] text-muted">다시 만나고 싶지 않다고 고르면 앞으로 같은 테이블에 앉지 않아요.</p>
          <ul className="mt-3 space-y-2">
            {others.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-2.5">
                <span className="text-[15px]">{o.users.name}</span>
                <span className="flex gap-1.5 text-[13px]">
                  {[["again", "또 만나고 싶어요"], ["", "괜찮아요"], ["avoid", "다시는 싫어요"]].map(([v, l]) => (
                    <label key={v} className="cursor-pointer">
                      <input type="radio" name={`pref_${o.user_id}`} value={v} defaultChecked={(prefMap.get(o.user_id) ?? "") === v} className="peer sr-only" />
                      <span className="block rounded-full border border-line px-2.5 py-1 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">{l}</span>
                    </label>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <label className="block">
          <span className="text-[14px] font-medium">한마디</span>
          <textarea name="comment" defaultValue={fb?.comment ?? ""} rows={3} placeholder="좋았던 점이나 아쉬웠던 점을 적어 주세요" className={`${inputCls} mt-2`} />
        </label>
        <PrimaryButton type="submit">후기 보내기</PrimaryButton>
      </form>

      <section id="report" className="mt-12 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-[15px] font-semibold">신고하기</h2>
        <p className="mt-1 text-[13px] text-muted">신고하면 상대를 바로 차단하고 운영팀이 확인해요. 상대에게는 알리지 않아요.</p>
        <form action={report} className="mt-4 space-y-3">
          <input type="hidden" name="table_id" value={id} />
          <select name="target" defaultValue="" className={inputCls}>
            <option value="" disabled>누구를 신고할까요?</option>
            {others.map((o) => (
              <option key={o.user_id} value={o.user_id}>{o.users.name}</option>
            ))}
          </select>
          <select name="reason" defaultValue="" className={inputCls}>
            <option value="" disabled>이유</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <textarea name="detail" rows={2} placeholder="자세한 내용 (선택)" className={inputCls} />
          <ErrorText msg={e} />
          <button className="w-full rounded-xl border border-accent py-3 text-[15px] font-semibold text-accent">신고하고 차단하기</button>
        </form>
      </section>
    </Screen>
  );
}
