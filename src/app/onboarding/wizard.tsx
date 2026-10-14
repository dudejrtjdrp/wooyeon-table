"use client";

import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { PrimaryButton } from "@/components/client";
import { PassButton } from "./pass-button";

type Profile = {
  birth_year?: number | null; gender?: string | null; job?: string | null; mbti?: string | null;
  interests?: string[]; my_traits?: string[]; wanted_traits?: string[]; price_range?: string | null; food_restrictions?: string | null; agreed_at?: string | null;
} | null;

const input =
  "h-[52px] w-full rounded-2xl border border-line bg-card px-4 text-[16px] outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/10";

function ChipSet({ name, options, selected, type = "checkbox", max }: { name: string; options: readonly string[]; selected?: string[]; type?: "checkbox" | "radio"; max?: number }) {
  const [picked, setPicked] = useState<string[]>(selected ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = picked.includes(o);
        return (
          <label key={o} className="cursor-pointer">
            <input
              type={type}
              name={name}
              value={o}
              checked={on}
              onChange={() =>
                setPicked((p) => (type === "radio" ? [o] : on ? p.filter((x) => x !== o) : max && p.length >= max ? p : [...p, o]))
              }
              className="peer sr-only"
            />
            <span className="inline-block rounded-full border border-line bg-card px-4 py-2.5 text-[15px] transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
              {o}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <p className="mb-2.5 text-[15px] font-semibold">
    {children}
    {hint && <span className="ml-1.5 text-[13px] font-normal text-muted">{hint}</span>}
  </p>
);

export function OnboardingWizard({
  action,
  profile: p,
  name,
  phone,
  next,
  error,
  prefill,
  lists,
  editing,
  verified,
  idvOn,
  userKey,
}: {
  action: (f: FormData) => void | Promise<void>;
  profile: Profile;
  name: string;
  phone: string | null;
  next: string;
  error?: string;
  prefill: { by?: number; g?: string };
  lists: { interests: readonly string[]; traits: readonly string[]; mbtis: readonly string[]; prices: readonly string[] };
  editing: boolean;
  verified: { name: string; phone: string | null; birthYear: number; gender: "M" | "F" | null } | null;
  idvOn: boolean;
  userKey: string;
}) {
  const steps = ["기본 정보", "나에 대해", "식사 취향", "동의"];
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<string | null>(error ?? null);
  const form = useRef<HTMLFormElement>(null);
  const years = Array.from({ length: 2007 - 1970 + 1 }, (_, i) => 2007 - i);

  const check = (i: number): string | null => {
    const f = new FormData(form.current!);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    if (i === 0) {
      if (idvOn && !verified) return "PASS 본인인증을 먼저 해 주세요";
      if (v("name").length < 2) return "이름을 두 글자 이상 적어 주세요";
      if (!/^01\d{8,9}$/.test(v("phone").replace(/-/g, ""))) return "휴대폰 번호를 확인해 주세요. 모임 안내를 이 번호로 보내요";
      if (!v("birth_year")) return "출생연도를 골라 주세요";
      if (!v("gender")) return "성별을 골라 주세요";
      if (!v("job")) return "하는 일을 적어 주세요";
    }
    if (i === 1) {
      if (f.getAll("interests").length < 2) return "관심사를 두 개 이상 골라 주세요";
      if (f.getAll("my_traits").length < 1) return "나를 설명하는 성향을 하나 이상 골라 주세요";
    }
    if (i === 2) {
      if (f.getAll("wanted_traits").length < 1) return "만나고 싶은 사람의 성향을 하나 이상 골라 주세요";
      if (!v("price_range")) return "식사 가격대를 골라 주세요";
    }
    if (i === 3 && !(f.get("agree_privacy") && f.get("agree_policy"))) return "필수 항목에 동의해 주세요";
    return null;
  };

  const goNext = () => {
    const e = check(step);
    setMsg(e);
    if (!e) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    }
  };

  const [agree, setAgree] = useState({ privacy: Boolean(p?.agreed_at), policy: Boolean(p?.agreed_at), marketing: false });
  const all = agree.privacy && agree.policy && agree.marketing;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur">
        <div className="grid h-14 grid-cols-[48px_1fr_48px] items-center px-3">
          <div>
            {step > 0 ? (
              <button type="button" aria-label="이전 단계" onClick={() => { setMsg(null); setStep((s) => s - 1); }} className="-ml-2 flex size-10 items-center justify-center rounded-full">
                <ChevronLeft size={26} />
              </button>
            ) : editing ? (
              <Link href={next} aria-label="닫기" className="-ml-2 flex size-10 items-center justify-center rounded-full"><ChevronLeft size={26} /></Link>
            ) : null}
          </div>
          <p className="text-center text-[15px] font-semibold">{editing ? "프로필 수정" : `${step + 1} / ${steps.length}`}</p>
        </div>
        <div className="mx-5 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <form ref={form} action={action} className="flex flex-1 flex-col px-5 pb-32" noValidate>
        <input type="hidden" name="next" value={next} />

        <section hidden={step !== 0} className="pt-6">
          <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">{editing ? "기본 정보" : "반가워요! 먼저 기본 정보를 알려 주세요"}</h1>
          <p className="mt-2 text-[14px] text-muted">다른 참가자에게는 이름과 짧은 소개만 보여요.</p>
          <div className="mt-7 space-y-6">
            {verified ? (
              <div className="rounded-3xl bg-card p-5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-leaf"><Check size={16} strokeWidth={3} />본인인증 완료</p>
                <p className="mt-2 text-[18px] font-bold">{verified.name}</p>
                <p className="mt-0.5 text-[14px] text-muted">
                  {verified.birthYear}년생, {verified.gender === "M" ? "남성" : verified.gender === "F" ? "여성" : ""}{verified.phone ? `, ${verified.phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")}` : ""}
                </p>
                <input type="hidden" name="name" value={verified.name} />
                <input type="hidden" name="phone" value={verified.phone ?? phone ?? ""} />
                <input type="hidden" name="birth_year" value={verified.birthYear} />
                <input type="hidden" name="gender" value={verified.gender === "M" ? "남성" : "여성"} />
              </div>
            ) : idvOn ? (
              <div className="rounded-3xl bg-card p-5">
                <p className="text-[16px] font-bold">안전한 식탁을 위해 본인인증이 필요해요</p>
                <p className="mt-1 mb-4 text-[14px] leading-relaxed text-muted">이름, 나이, 성별을 실제 정보로 확인해요. 다른 참가자에게는 나이와 번호가 보이지 않아요.</p>
                <PassButton userKey={userKey} next={next} onError={setMsg} />
              </div>
            ) : (
              <>
                <div><Label>이름</Label><input name="name" defaultValue={name} autoComplete="name" className={input} /></div>
                <div>
                  <Label hint="모임 안내를 보내요">휴대폰 번호</Label>
                  <input name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="tel" placeholder="01012345678" className={input} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>출생연도</Label>
                    <select name="birth_year" defaultValue={p?.birth_year ?? prefill.by ?? ""} className={input}>
                      <option value="" disabled>선택</option>
                      {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>성별</Label>
                    <ChipSet name="gender" type="radio" options={["남성", "여성"]} selected={(p?.gender ?? prefill.g) === "M" ? ["남성"] : (p?.gender ?? prefill.g) === "F" ? ["여성"] : []} />
                  </div>
                </div>
              </>
            )}
            <div><Label>하는 일</Label><input name="job" defaultValue={p?.job ?? ""} placeholder="예: 마케터, 대학원생, 개발자" className={input} /></div>
          </div>
        </section>

        <section hidden={step !== 1} className="pt-6">
          <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">어떤 사람인지 알려 주세요</h1>
          <p className="mt-2 text-[14px] text-muted">대화가 잘 통할 사람을 고르는 데 써요.</p>
          <div className="mt-7 space-y-7">
            <div><Label hint="두 개 이상">관심사</Label><ChipSet name="interests" options={lists.interests} selected={p?.interests} /></div>
            <div><Label hint="최대 3개">나는 이런 사람이에요</Label><ChipSet name="my_traits" options={lists.traits} selected={p?.my_traits} max={3} /></div>
            <div>
              <Label hint="몰라도 괜찮아요">MBTI</Label>
              <select name="mbti" defaultValue={p?.mbti ?? ""} className={input}>
                <option value="">잘 모르겠어요</option>
                {lists.mbtis.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section hidden={step !== 2} className="pt-6">
          <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">식탁에서 바라는 것</h1>
          <div className="mt-7 space-y-7">
            <div><Label hint="최대 3개">이런 사람을 만나고 싶어요</Label><ChipSet name="wanted_traits" options={lists.traits} selected={p?.wanted_traits} max={3} /></div>
            <div><Label>1인 식사 가격대</Label><ChipSet name="price_range" type="radio" options={lists.prices} selected={p?.price_range ? [p.price_range] : []} /></div>
            <div><Label hint="없으면 비워 두세요">못 먹는 음식이나 알레르기</Label><input name="food_restrictions" defaultValue={p?.food_restrictions ?? ""} placeholder="예: 갑각류, 오이" className={input} /></div>
          </div>
        </section>

        <section hidden={step !== 3} className="pt-6">
          <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">마지막으로 동의가 필요해요</h1>
          <div className="mt-7 rounded-3xl bg-card p-2">
            <button
              type="button"
              onClick={() => setAgree({ privacy: !all, policy: !all, marketing: !all })}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-4 text-left text-[17px] font-bold"
            >
              <span className={`flex size-6 items-center justify-center rounded-full ${all ? "bg-accent text-white" : "border-2 border-line"}`}>{all && <Check size={15} strokeWidth={3} />}</span>
              모두 동의해요
            </button>
            <div className="mx-3 h-px bg-line" />
            {([
              ["privacy", "agree_privacy", "개인정보 수집·이용 동의 (필수)", "/privacy"],
              ["policy", "agree_policy", "이용약관과 환불·노쇼 정책 동의 (필수)", "/terms"],
              ["marketing", "agree_marketing", "새 일정 소식 받기 (선택)", null],
            ] as const).map(([k, n, l, href]) => (
              <label key={k} className="flex items-center gap-3 px-3 py-3.5 text-[15px]">
                <input type="checkbox" name={n} checked={agree[k]} onChange={(e) => setAgree((a) => ({ ...a, [k]: e.target.checked }))} className="peer sr-only" />
                <span className={`flex size-5 items-center justify-center ${agree[k] ? "text-accent" : "text-line"}`}><Check size={18} strokeWidth={3} /></span>
                <span className="flex-1">{l}</span>
                {href && <Link href={href} className="text-[13px] text-muted underline underline-offset-2">보기</Link>}
              </label>
            ))}
          </div>
        </section>

        {msg && <p role="alert" className="mt-6 rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">{msg}</p>}

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3">
            {step < steps.length - 1 ? (
              <button type="button" onClick={goNext} className="flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-white active:scale-[.985]">
                다음
              </button>
            ) : (
              <PrimaryButton
                type="submit"
                pendingText="저장하는 중"
                onClick={(e) => {
                  const err = check(3);
                  if (err) { e.preventDefault(); setMsg(err); }
                }}
              >
                {editing ? "저장하기" : "시작하기"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
