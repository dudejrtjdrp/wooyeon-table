import { Chips, ErrorText, Field, PrimaryButton, Screen, inputCls } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { INTERESTS, MBTIS, PRICE_RANGES, TRAITS } from "@/lib/constants";
import { db } from "@/lib/supabase";
import { saveProfile } from "./actions";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const me = await requireMe();
  const { e, next } = await searchParams;
  const { data: p } = await db().from("profiles").select("*").eq("user_id", me.id).maybeSingle();
  const years = Array.from({ length: 2007 - 1970 + 1 }, (_, i) => 2007 - i);

  return (
    <Screen title={p ? "프로필 수정" : "나를 소개해 주세요"} back={p ? "/me" : undefined}>
      <p className="text-[15px] leading-relaxed text-muted">
        {me.name}님과 결이 맞는 사람을 찾는 데 쓸게요. 다른 참가자에게는 매칭이 확정된 뒤에도 이름과 짧은 소개만 보여요.
      </p>

      <form action={saveProfile} className="mt-8 space-y-8">
        <input type="hidden" name="next" value={next ?? "/"} />

        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-accent">기본 정보</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="출생연도">
              <select name="birth_year" defaultValue={p?.birth_year ?? ""} className={inputCls}>
                <option value="" disabled>선택</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </Field>
            <Field label="성별">
              <div className="flex gap-2">
                {[["M", "남성"], ["F", "여성"]].map(([v, l]) => (
                  <label key={v} className="flex-1 cursor-pointer">
                    <input type="radio" name="gender" value={v} defaultChecked={p?.gender === v} className="peer sr-only" />
                    <span className="block rounded-xl border border-line bg-card py-3 text-center text-[15px] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">
                      {l}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <Field label="하는 일">
            <input name="job" defaultValue={p?.job ?? ""} placeholder="예: 마케터, 대학원생, 개발자" className={inputCls} />
          </Field>
        </section>

        <section className="space-y-5">
          <h2 className="text-[13px] font-semibold tracking-wide text-accent">매칭에 쓰는 정보</h2>
          <Field label="MBTI" hint="몰라도 괜찮아요">
            <select name="mbti" defaultValue={p?.mbti ?? ""} className={inputCls}>
              <option value="">잘 모르겠어요</option>
              {MBTIS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <div>
            <p className="text-[14px] font-medium">관심사 <span className="text-[12px] font-normal text-muted">두 개 이상</span></p>
            <div className="mt-2"><Chips name="interests" options={INTERESTS} selected={p?.interests ?? []} /></div>
          </div>
          <div>
            <p className="text-[14px] font-medium">나는 이런 사람이에요</p>
            <div className="mt-2"><Chips name="my_traits" options={TRAITS} selected={p?.my_traits ?? []} /></div>
          </div>
          <div>
            <p className="text-[14px] font-medium">이런 사람을 만나고 싶어요</p>
            <div className="mt-2"><Chips name="wanted_traits" options={TRAITS} selected={p?.wanted_traits ?? []} /></div>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-[13px] font-semibold tracking-wide text-accent">식사</h2>
          <div>
            <p className="text-[14px] font-medium">1인 식사 가격대</p>
            <div className="mt-2"><Chips name="price_range" type="radio" options={PRICE_RANGES} selected={p?.price_range ? [p.price_range] : []} /></div>
          </div>
          <Field label="못 먹는 음식이나 알레르기" hint="없으면 비워 두세요">
            <input name="food_restrictions" defaultValue={p?.food_restrictions ?? ""} placeholder="예: 갑각류, 오이" className={inputCls} />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          {[
            ["agree_privacy", "개인정보 수집·이용에 동의해요 (필수)"],
            ["agree_policy", "환불·노쇼 정책을 포함한 운영 정책에 동의해요 (필수)"],
          ].map(([n, l]) => (
            <label key={n} className="flex items-start gap-3 text-[14px]">
              <input type="checkbox" name={n} defaultChecked={Boolean(p?.agreed_at)} className="mt-0.5 size-5 accent-[var(--ink)]" />
              <span>{l}</span>
            </label>
          ))}
        </section>

        <ErrorText msg={e} />
        <PrimaryButton type="submit">{p ? "저장하기" : "다음"}</PrimaryButton>
      </form>
    </Screen>
  );
}
