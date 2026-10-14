"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Lock, Minus, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/components/client";
import { PrivacyBody, TermsBody } from "@/components/legal";
import { PassButton } from "./pass-button";

type Profile = {
  birth_year?: number | null; gender?: string | null; job?: string | null; mbti?: string | null;
  interests?: string[]; my_traits?: string[]; wanted_traits?: string[]; price_range?: string | null; food_restrictions?: string | null; agreed_at?: string | null; marketing_opt_in?: boolean | null;
} | null;

type Values = {
  name: string; birth_year: string; gender: string; job: string; mbti: string;
  interests: string[]; my_traits: string[]; wanted_traits: string[]; price_range: string; food: string;
  agree_privacy: boolean; agree_policy: boolean; agree_marketing: boolean;
};

const input =
  "h-[54px] w-full rounded-2xl border border-[#e8edf5] bg-field px-4 text-[16px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent focus:bg-card focus:ring-4 focus:ring-accent/10";
const reqBox = "";
const badge = "ml-2 inline-flex h-[22px] items-center rounded-full px-2 align-middle text-[11px] font-semibold";

/** 흰 카드 + 제목 + 필수/선택 표시 */
function Block({ title, required, hint, right, children }: { title: string; required?: boolean; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="shadow-card rounded-[22px] bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[17px] font-bold tracking-[-0.02em] text-ink">
          {title}
          <span className={`${badge} ${required ? "bg-accent-soft text-accent" : "bg-line/70 text-muted"}`}>{required ? "필수" : "선택"}</span>
        </p>
        {right}
      </div>
      {hint && <p className="mt-1.5 text-[14px] text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chips({ name, options, value, onChange, radio, max, cols = 4 }: { name: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; radio?: boolean; max?: number; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-3 min-[380px]:grid-cols-4" }[cols];
  return (
    <div className={`grid gap-2 ${grid}`}>
      {options.map((o) => {
        const on = value.includes(o);
        const full = !on && !radio && max !== undefined && value.length >= max;
        return (
          <label key={o} className={`cursor-pointer ${full ? "opacity-45" : ""}`}>
            <input
              type={radio ? "radio" : "checkbox"}
              name={name}
              value={o}
              checked={on}
              onChange={() => onChange(radio ? [o] : on ? value.filter((x) => x !== o) : full ? value : [...value, o])}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center justify-center gap-1 rounded-full border border-line bg-card px-2 py-2 text-center text-[14px] leading-tight text-ink transition duration-150 peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
              {on && !radio && <Check size={15} strokeWidth={2.8} className="shrink-0" />}
              {o}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const PRICE_DESC: Record<string, string> = { "1만 원대": "가볍게 즐기는 식사", "2만 원대": "부담 없는 한 끼", "3만 원대": "여유 있는 저녁", "상관없어요": "어디든 좋아요" };

/** 단계 위쪽 제목과 오른쪽 위 사진 */
function StepHero({ title, accent, sub, img }: { title: string; accent: string; sub?: string; img?: { src: string; contain?: boolean } }) {
  return (
    <div className="relative pt-5">
      {img && (
        <div className="pointer-events-none absolute -right-5 -top-4 h-[180px] w-[50%]" style={{ maskImage: "radial-gradient(100% 90% at 80% 30%, #000 45%, transparent 75%)", WebkitMaskImage: "radial-gradient(100% 90% at 80% 30%, #000 45%, transparent 75%)" }}>
          <Image src={img.src} alt="" fill sizes="260px" priority className={img.contain ? "object-contain" : "object-cover"} />
        </div>
      )}
      <h1 className="animate-rise relative text-[28px] font-bold leading-[1.3] tracking-[-0.03em] text-ink">
        {title}
        <br />
        <span className="text-accent">{accent}</span>
      </h1>
      {sub && <p className="relative mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

/** 약관을 화면을 떠나지 않고 아래에서 올라오는 창으로 보여준다 (입력한 내용이 그대로 남는다) */
function DocSheet({ doc, onClose }: { doc: "terms" | "privacy" | null; onClose: () => void }) {
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button aria-label="닫기" className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-sheet pb-safe relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-card">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <p className="text-[17px] font-bold">{doc === "terms" ? "이용약관" : "개인정보 처리방침"}</p>
          <button onClick={onClose} aria-label="닫기" className="-mr-2 flex size-10 items-center justify-center rounded-full"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 text-[14px] leading-[1.75] [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-[15px] [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_ul]:mb-2">
          {doc === "terms" ? <TermsBody /> : <PrivacyBody />}
        </div>
        <div className="border-t border-line px-5 py-3">
          <button onClick={onClose} className="h-12 w-full rounded-2xl bg-ink text-[15px] font-semibold text-white">확인했어요</button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingWizard({
  action, profile: p, name, phone, next, error, prefill, lists, editing, verified, idvOn, userKey, phoneVerified,
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
  phoneVerified: boolean;
}) {
  const steps = ["기본 정보", "나에 대해", "식사 취향", "동의"];
  const storeKey = `wt_onb_${userKey}`;
  const g0 = p?.gender ?? prefill.g;
  const initial: Values = {
    name,
    birth_year: String(p?.birth_year ?? prefill.by ?? ""),
    gender: g0 === "M" ? "남성" : g0 === "F" ? "여성" : "",
    job: p?.job ?? "",
    mbti: p?.mbti ?? "",
    interests: p?.interests ?? [],
    my_traits: p?.my_traits ?? [],
    wanted_traits: p?.wanted_traits ?? [],
    price_range: p?.price_range ?? "",
    food: p?.food_restrictions ?? "",
    agree_privacy: Boolean(p?.agreed_at),
    agree_policy: Boolean(p?.agreed_at),
    agree_marketing: Boolean(p?.marketing_opt_in),
  };
  const [v, setV] = useState<Values>(initial);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<string | null>(error ?? null);
  const [doc, setDoc] = useState<"terms" | "privacy" | null>(null);
  const restored = useRef(false);

  // 휴대폰 인증처럼 화면을 잠깐 떠났다 돌아와도 입력한 내용과 단계를 이어 간다
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storeKey);
      if (saved) {
        const s = JSON.parse(saved) as { v: Values; step: number };
        setV((cur) => ({ ...cur, ...s.v, name: verified?.name ?? (s.v.name || cur.name) }));
        setStep(Math.min(s.step ?? 0, 3));
      }
    } catch {}
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify({ v, step })); } catch {}
  }, [v, step, storeKey]);

  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const years = Array.from({ length: 2007 - 1970 + 1 }, (_, i) => 2007 - i);

  const check = (i: number): string | null => {
    if (i === 0) {
      if (idvOn && !verified) return "PASS 본인인증을 먼저 해 주세요";
      if (!verified && !phoneVerified) return "휴대폰 번호 인증을 먼저 해 주세요";
      if (!verified && v.name.trim().length < 2) return "이름을 두 글자 이상 적어 주세요";
      if (!verified && !v.birth_year) return "출생연도를 골라 주세요";
      if (!verified && !v.gender) return "성별을 골라 주세요";
      if (!v.job.trim()) return "하는 일을 적어 주세요";
    }
    if (i === 1) {
      if (!v.mbti) return "MBTI를 골라 주세요";
      if (v.interests.length < 2) return "관심사를 두 개 이상 골라 주세요";
      if (v.my_traits.length < 1) return "나를 설명하는 성향을 하나 이상 골라 주세요";
    }
    if (i === 2) {
      if (v.wanted_traits.length < 1) return "만나고 싶은 사람의 성향을 하나 이상 골라 주세요";
      if (!v.price_range) return "식사 가격대를 골라 주세요";
    }
    if (i === 3 && !(v.agree_privacy && v.agree_policy)) return "필수 항목에 동의해 주세요";
    return null;
  };

  const go = (to: number) => {
    setMsg(null);
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const goNext = () => {
    const e = check(step);
    setMsg(e);
    if (!e) go(step + 1);
  };

  const all = v.agree_privacy && v.agree_policy && v.agree_marketing;
  const verifyHref = `/verify/phone?next=${encodeURIComponent(`/onboarding?next=${next}`)}`;
  const hiddenGender = verified?.gender === "M" ? "남성" : verified?.gender === "F" ? "여성" : v.gender;

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const some = v.agree_privacy || v.agree_policy || v.agree_marketing;
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-x-hidden bg-paper">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[340px]" style={{ maskImage: "linear-gradient(#000 40%, transparent)", WebkitMaskImage: "linear-gradient(#000 40%, transparent)" }}>
        <Image src="/images/dining/generated/10-soft-background.png" alt="" fill sizes="448px" priority className="object-cover" style={{ objectPosition: "right top" }} />
      </div>
      <header className="pt-safe sticky top-0 z-20">
        <div className="flex h-14 items-center px-3">
          {step > 0 ? (
            <button type="button" aria-label="이전 단계" onClick={() => go(step - 1)} className="flex size-10 items-center justify-center rounded-full text-ink">
              <ChevronLeft size={27} />
            </button>
          ) : editing ? (
            <Link href={next} aria-label="닫기" className="flex size-10 items-center justify-center rounded-full text-ink"><ChevronLeft size={27} /></Link>
          ) : <span className="size-10" />}
        </div>
        <div className="px-5 pb-2">
          <p className="text-[16px] font-semibold text-ink">{steps[step]} <span className="text-muted">{step + 1}/{steps.length}</span></p>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-[5px] max-w-[62%] flex-1 overflow-hidden rounded-full bg-line/80">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[14px] tabular-nums text-muted">{pct}%</span>
          </div>
        </div>
      </header>

      <form
        action={action}
        onSubmit={() => { try { sessionStorage.removeItem(storeKey); } catch {} }}
        className="relative z-10 flex flex-1 flex-col px-5 pb-32"
        noValidate
      >
        <input type="hidden" name="next" value={next} />
        {/* 단계 화면은 감춰도 값은 모두 함께 보낸다 */}
        <input type="hidden" name="name" value={verified?.name ?? v.name} />
        <input type="hidden" name="phone" value={verified?.phone ?? phone ?? ""} />
        <input type="hidden" name="birth_year" value={verified ? String(verified.birthYear) : v.birth_year} />
        <input type="hidden" name="gender" value={hiddenGender} />
        <input type="hidden" name="job" value={v.job} />
        <input type="hidden" name="mbti" value={v.mbti} />
        {v.interests.map((x) => <input key={`i-${x}`} type="hidden" name="interests" value={x} />)}
        {v.my_traits.map((x) => <input key={`m-${x}`} type="hidden" name="my_traits" value={x} />)}
        {v.wanted_traits.map((x) => <input key={`w-${x}`} type="hidden" name="wanted_traits" value={x} />)}
        <input type="hidden" name="price_range" value={v.price_range} />
        <input type="hidden" name="food_restrictions" value={v.food} />
        {v.agree_privacy && <input type="hidden" name="agree_privacy" value="on" />}
        {v.agree_policy && <input type="hidden" name="agree_policy" value="on" />}
        {v.agree_marketing && <input type="hidden" name="agree_marketing" value="on" />}

        {step === 0 && (
          <section>
            <StepHero title={editing ? "기본 정보를" : "반가워요!"} accent={editing ? "확인해 주세요" : "먼저 기본 정보를 알려 주세요."} img={{ src: "/images/dining/generated/09-table-object.png", contain: true }} />
            <div className="mt-7 space-y-3">
              {verified ? (
                <section className="shadow-card rounded-[22px] bg-card p-5">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-leaf"><CircleCheck size={17} />본인인증 완료</p>
                  <p className="mt-2 text-[18px] font-bold">{verified.name}</p>
                  <p className="mt-0.5 text-[14px] text-muted">{verified.birthYear}년생, {verified.gender === "M" ? "남성" : verified.gender === "F" ? "여성" : ""}</p>
                </section>
              ) : idvOn ? (
                <section className="shadow-card rounded-[22px] bg-card p-5">
                  <p className="text-[16px] font-bold">안전한 식탁을 위해 본인인증이 필요해요</p>
                  <p className="mb-4 mt-1 text-[14px] leading-relaxed text-muted">이름, 나이, 성별을 실제 정보로 확인해요. 다른 참가자에게는 나이와 번호가 보이지 않아요.</p>
                  <PassButton userKey={userKey} next={next} onError={setMsg} />
                </section>
              ) : (
                <>
                  {/* 임시: 사업자 등록 뒤 PASS 본인인증(위 idvOn 분기)으로 대체할 휴대폰 문자 인증 */}
                  <Block title="휴대폰 번호 인증" required>
                    {phoneVerified ? (
                      <div className="flex h-[54px] items-center justify-between rounded-2xl border border-[#e8edf5] bg-card px-4">
                        <span className="text-[17px] text-ink">{(phone ?? "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3")}</span>
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[14px] font-semibold text-leaf"><CircleCheck size={18} className="fill-leaf text-white" />인증 완료</span>
                          <Link href={verifyHref} className="text-[13px] text-muted underline underline-offset-2">바꾸기</Link>
                        </span>
                      </div>
                    ) : (
                      <Link href={verifyHref} className="flex h-[54px] items-center justify-between rounded-2xl border-[1.5px] border-dashed border-accent/50 bg-accent-soft/40 px-4 text-[16px] font-semibold text-accent">
                        휴대폰 번호 인증하기 <ChevronRight size={20} />
                      </Link>
                    )}
                  </Block>
                  <Block title="이름" required>
                    <input value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="실명을 적어 주세요" className={`${input} ${reqBox}`} />
                  </Block>
                  <Block title="출생연도" required>
                    <div className="relative">
                      <select value={v.birth_year} onChange={(e) => set("birth_year", e.target.value)} className={`${input} appearance-none pr-12`}>
                        <option value="" disabled>출생연도를 골라 주세요</option>
                        {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                      </select>
                      <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
                    </div>
                  </Block>
                  <Block title="성별" required>
                    <div className="grid grid-cols-2 gap-2">
                      {["여성", "남성"].map((x) => (
                        <button key={x} type="button" aria-pressed={v.gender === x} onClick={() => set("gender", x)} className={`h-[54px] rounded-2xl text-[16px] font-semibold transition ${v.gender === x ? "bg-accent text-white" : "bg-field text-ink"}`}>{x}</button>
                      ))}
                    </div>
                  </Block>
                </>
              )}
              <Block title="하는 일" required>
                <input value={v.job} onChange={(e) => set("job", e.target.value)} placeholder="예: 브랜드 디자이너, 대학원생" className={`${input} ${reqBox}`} />
              </Block>
              <p className="flex items-center justify-center gap-1.5 pt-2 text-[13px] text-muted"><Lock size={14} />입력한 정보는 안전하게 보관해요.</p>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <StepHero title="어떤 사람인지" accent="알려 주세요" sub="더 좋은 식탁을 위해, 당신에 대해 조금만 알려 주세요." />
            <div className="mt-7 space-y-3">
              <Block
                title="MBTI"
                required
                right={<a href="https://www.16personalities.com/ko" target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[13px] font-medium text-accent">모르겠어요 · 검사하기<ChevronRight size={15} /></a>}
              >
                <div className="relative">
                  <select value={v.mbti} onChange={(e) => set("mbti", e.target.value)} className={`${input} appearance-none pr-12 font-semibold`}>
                    <option value="" disabled>MBTI를 골라 주세요</option>
                    {lists.mbtis.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
                </div>
              </Block>
              <Block title="관심사" required hint="2개 이상 골라 주세요.">
                <Chips name="_interests" options={lists.interests} value={v.interests} onChange={(x) => set("interests", x)} cols={3} />
              </Block>
              <Block title="나는 이런 사람" required hint="최대 3개까지 골라 주세요.">
                <Chips name="_my" options={lists.traits} value={v.my_traits} onChange={(x) => set("my_traits", x)} max={3} />
              </Block>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <StepHero title="식탁에서" accent="바라는 것" img={{ src: "/images/dining/generated/05-place-setting.png" }} />
            <div className="mt-8 space-y-3">
              <Block title="만나고 싶은 사람" required hint="최대 3개 골라 주세요.">
                <Chips name="_wanted" options={lists.traits} value={v.wanted_traits} onChange={(x) => set("wanted_traits", x)} max={3} />
              </Block>
              <Block title="1인 식사 가격대" required hint="하나를 골라 주세요.">
                <div className="grid grid-cols-2 gap-2">
                  {lists.prices.map((o) => {
                    const on = v.price_range === o;
                    return (
                      <button key={o} type="button" aria-pressed={on} onClick={() => set("price_range", o)} className={`rounded-2xl border p-3.5 text-left transition ${on ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-line bg-card"}`}>
                        <span className={`flex size-5 items-center justify-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`}>{on && <span className="size-2.5 rounded-full bg-accent" />}</span>
                        <span className="mt-2.5 block text-[16px] font-bold text-ink">{o}</span>
                        <span className="mt-0.5 block text-[12px] text-muted">{PRICE_DESC[o] ?? ""}</span>
                      </button>
                    );
                  })}
                </div>
              </Block>
              <Block title="못 먹는 음식·알레르기" hint="있다면 알려 주세요.">
                <div className="relative">
                  <textarea value={v.food} onChange={(e) => set("food", e.target.value.slice(0, 200))} rows={3} placeholder="예: 갑각류 알레르기가 있어요." className="w-full resize-none rounded-2xl border border-[#e8edf5] bg-field px-4 pb-7 pt-3.5 text-[16px] text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:bg-card" />
                  <span className="absolute bottom-3 right-4 text-[12px] tabular-nums text-muted">{v.food.length}/200</span>
                </div>
              </Block>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <StepHero title="마지막으로" accent="동의가 필요해요" img={{ src: "/images/dining/generated/09-table-object.png", contain: true }} />
            <div className="shadow-card mt-8 rounded-[22px] bg-card px-5 py-2">
              <button
                type="button"
                onClick={() => setV((c) => ({ ...c, agree_privacy: !all, agree_policy: !all, agree_marketing: !all }))}
                className="flex w-full items-start gap-4 border-b border-line py-5 text-left"
              >
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${some ? "bg-accent text-white" : "border-2 border-line"}`}>
                  {all ? <Check size={18} strokeWidth={3} /> : some ? <Minus size={18} strokeWidth={3} /> : null}
                </span>
                <span>
                  <span className="block text-[19px] font-bold text-ink">모두 동의</span>
                  <span className="mt-1 block text-[14px] text-muted">선택 동의까지 한 번에 선택할 수 있어요.</span>
                </span>
              </button>
              {([
                ["agree_privacy", "개인정보 수집·이용", true, "privacy", null],
                ["agree_policy", "이용약관·환불·노쇼 정책", true, "terms", null],
                ["agree_marketing", "새 일정 소식", false, null, "새로운 식탁이 열리면 알려드려요."],
              ] as const).map(([k, l, req, d, desc], i) => (
                <div key={k} className={`flex items-start gap-3 py-5 ${i < 2 ? "border-b border-line" : ""}`}>
                  <button type="button" role="checkbox" aria-checked={v[k]} onClick={() => set(k, !v[k])} className="flex flex-1 items-start gap-4 text-left">
                    <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition ${v[k] ? "bg-accent text-white" : "border-2 border-line"}`}>{v[k] && <Check size={18} strokeWidth={3} />}</span>
                    <span>
                      <span className="text-[17px] font-bold text-ink">{l}</span>
                      <span className={`${badge} ${req ? "bg-accent-soft text-accent" : "bg-line/70 text-muted"}`}>{req ? "필수" : "선택"}</span>
                      {desc && <span className="mt-1 block text-[14px] text-muted">{desc}</span>}
                    </span>
                  </button>
                  {d && <button type="button" onClick={() => setDoc(d)} className="mt-1 flex shrink-0 items-center text-[14px] text-muted">보기<ChevronRight size={17} /></button>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-3.5 rounded-[22px] bg-accent-soft/60 p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-accent"><ShieldCheck size={22} /></span>
              <div>
                <p className="text-[15px] font-bold text-ink">다른 참가자에게는 이름과 하는 일만 보여요.</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">안전하고 편안한 만남을 위해 개인정보를 보호해요.</p>
              </div>
            </div>
          </section>
        )}

        {msg && <p role="alert" className="mt-6 rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">{msg}</p>}

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
          <div className="pb-3">
            {step < steps.length - 1 ? (
              <button type="button" onClick={goNext} className="shadow-cta flex h-[56px] w-full items-center justify-center gap-1 rounded-2xl bg-accent text-[17px] font-semibold text-white active:scale-[.985]">
                다음 <ChevronRight size={20} />
              </button>
            ) : (
              <PrimaryButton
                type="submit"
                pendingText="저장하는 중"
                onClick={(e) => {
                  for (let i = 0; i < 4; i++) {
                    const err = check(i);
                    if (err) { e.preventDefault(); setMsg(err); if (i < 3) go(i); setMsg(err); return; }
                  }
                }}
              >
                {editing ? "저장하기" : "시작하기"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </form>
      <DocSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
