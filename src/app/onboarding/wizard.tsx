"use client";

import { Check, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/components/client";
import { PrivacyBody, TermsBody } from "@/components/legal";
import { PassButton } from "./pass-button";

type Profile = {
  birth_year?: number | null; gender?: string | null; job?: string | null; mbti?: string | null;
  interests?: string[]; my_traits?: string[]; wanted_traits?: string[]; price_range?: string | null; food_restrictions?: string | null; agreed_at?: string | null;
} | null;

type Values = {
  name: string; birth_year: string; gender: string; job: string; mbti: string;
  interests: string[]; my_traits: string[]; wanted_traits: string[]; price_range: string; food: string;
  agree_privacy: boolean; agree_policy: boolean; agree_marketing: boolean;
};

const input =
  "h-[52px] w-full rounded-2xl border bg-card px-4 text-[16px] outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/10";
const reqBox = "border-line";

/** 필수·선택 표시. 필수는 색 있는 표시, 선택은 회색 글자 */
function Label({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <p className="mb-2.5 flex items-center gap-1.5 text-[15px] font-semibold">
      {children}
      {required ? (
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent">필수</span>
      ) : (
        <span className="text-[12px] font-medium text-muted">선택</span>
      )}
      {hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}
    </p>
  );
}

function Chips({ name, options, value, onChange, radio, max }: { name: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; radio?: boolean; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <label key={o} className="cursor-pointer">
            <input
              type={radio ? "radio" : "checkbox"}
              name={name}
              value={o}
              checked={on}
              onChange={() => onChange(radio ? [o] : on ? value.filter((x) => x !== o) : max && value.length >= max ? value : [...value, o])}
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
    agree_marketing: false,
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur">
        <div className="grid h-14 grid-cols-[48px_1fr_48px] items-center px-3">
          <div>
            {step > 0 ? (
              <button type="button" aria-label="이전 단계" onClick={() => go(step - 1)} className="-ml-2 flex size-10 items-center justify-center rounded-full">
                <ChevronLeft size={26} />
              </button>
            ) : editing ? (
              <Link href={next} aria-label="닫기" className="-ml-2 flex size-10 items-center justify-center rounded-full"><ChevronLeft size={26} /></Link>
            ) : null}
          </div>
          <p className="text-center text-[15px] font-semibold">{steps[step]} <span className="font-normal text-muted">{step + 1}/{steps.length}</span></p>
        </div>
        <div className="mx-5 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <form
        action={action}
        onSubmit={() => { try { sessionStorage.removeItem(storeKey); } catch {} }}
        className="flex flex-1 flex-col px-5 pb-32"
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
          <section className="pt-6">
            <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">{editing ? "기본 정보" : "반가워요! 먼저 기본 정보를 알려 주세요"}</h1>
            <p className="mt-2 text-[14px] text-muted">다른 참가자에게는 이름과 하는 일만 보여요.</p>
            <div className="mt-7 space-y-6">
              {verified ? (
                <div className="rounded-3xl bg-card p-5">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-leaf"><Check size={16} strokeWidth={3} />본인인증 완료</p>
                  <p className="mt-2 text-[18px] font-bold">{verified.name}</p>
                  <p className="mt-0.5 text-[14px] text-muted">{verified.birthYear}년생, {verified.gender === "M" ? "남성" : verified.gender === "F" ? "여성" : ""}</p>
                </div>
              ) : idvOn ? (
                <div className="rounded-3xl bg-card p-5">
                  <p className="text-[16px] font-bold">안전한 식탁을 위해 본인인증이 필요해요</p>
                  <p className="mb-4 mt-1 text-[14px] leading-relaxed text-muted">이름, 나이, 성별을 실제 정보로 확인해요. 다른 참가자에게는 나이와 번호가 보이지 않아요.</p>
                  <PassButton userKey={userKey} next={next} onError={setMsg} />
                </div>
              ) : (
                <>
                  {/* 임시: 사업자 등록 뒤 PASS 본인인증(위 idvOn 분기)으로 대체할 휴대폰 문자 인증 */}
                  <div>
                    <Label required hint="모임 안내를 보내요">휴대폰 번호</Label>
                    {phoneVerified ? (
                      <div className="flex h-[52px] items-center justify-between rounded-2xl border border-line bg-card px-4">
                        <span className="flex items-center gap-2 text-[16px]">
                          <Check size={18} strokeWidth={3} className="text-leaf" />
                          {(phone ?? "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3")}
                        </span>
                        <Link href={verifyHref} className="text-[14px] font-medium text-muted">바꾸기</Link>
                      </div>
                    ) : (
                      <Link href={verifyHref} className="flex h-[52px] items-center justify-between rounded-2xl border-2 border-dashed border-accent/40 bg-card px-4 text-[16px] font-semibold text-accent">
                        휴대폰 번호 인증하기 <ChevronRight size={20} />
                      </Link>
                    )}
                  </div>
                  <div>
                    <Label required>이름</Label>
                    <input value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="실명을 적어 주세요" className={`${input} ${reqBox}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label required>출생연도</Label>
                      <select value={v.birth_year} onChange={(e) => set("birth_year", e.target.value)} className={`${input} ${reqBox}`}>
                        <option value="" disabled>선택</option>
                        {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                      </select>
                    </div>
                    <div>
                      <Label required>성별</Label>
                      <Chips name="_gender" radio options={["남성", "여성"]} value={v.gender ? [v.gender] : []} onChange={(x) => set("gender", x[0])} />
                    </div>
                  </div>
                </>
              )}
              <div>
                <Label required>하는 일</Label>
                <input value={v.job} onChange={(e) => set("job", e.target.value)} placeholder="예: 마케터, 대학원생, 개발자" className={`${input} ${reqBox}`} />
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="pt-6">
            <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">어떤 사람인지 알려 주세요</h1>
            <p className="mt-2 text-[14px] text-muted">대화가 잘 통할 사람을 고르는 데 써요.</p>
            <div className="mt-7 space-y-7">
              <div>
                <Label required>MBTI</Label>
                <select value={v.mbti} onChange={(e) => set("mbti", e.target.value)} className={`${input} ${reqBox}`}>
                  <option value="" disabled>MBTI를 골라 주세요</option>
                  {lists.mbtis.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <a href="https://www.16personalities.com/ko" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] text-muted underline underline-offset-2">
                  내 MBTI를 모르겠어요 <ExternalLink size={12} />
                </a>
              </div>
              <div><Label required hint="두 개 이상">관심사</Label><Chips name="_interests" options={lists.interests} value={v.interests} onChange={(x) => set("interests", x)} /></div>
              <div><Label required hint="최대 3개">나는 이런 사람이에요</Label><Chips name="_my" options={lists.traits} value={v.my_traits} onChange={(x) => set("my_traits", x)} max={3} /></div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="pt-6">
            <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">식탁에서 바라는 것</h1>
            <div className="mt-7 space-y-7">
              <div><Label required hint="최대 3개">이런 사람을 만나고 싶어요</Label><Chips name="_wanted" options={lists.traits} value={v.wanted_traits} onChange={(x) => set("wanted_traits", x)} max={3} /></div>
              <div><Label required>1인 식사 가격대</Label><Chips name="_price" radio options={lists.prices} value={v.price_range ? [v.price_range] : []} onChange={(x) => set("price_range", x[0])} /></div>
              <div>
                <Label>못 먹는 음식이나 알레르기</Label>
                <input value={v.food} onChange={(e) => set("food", e.target.value)} placeholder="없으면 비워 두세요 (예: 갑각류, 오이)" className={`${input} border-line`} />
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="pt-6">
            <h1 className="text-[24px] font-bold leading-snug tracking-[-0.02em]">마지막으로 동의가 필요해요</h1>
            <div className="mt-7 rounded-3xl bg-card p-2">
              <button
                type="button"
                onClick={() => setV((c) => ({ ...c, agree_privacy: !all, agree_policy: !all, agree_marketing: !all }))}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-4 text-left text-[17px] font-bold"
              >
                <span className={`flex size-6 items-center justify-center rounded-full ${all ? "bg-accent text-white" : "border-2 border-line"}`}>{all && <Check size={15} strokeWidth={3} />}</span>
                모두 동의해요
              </button>
              <div className="mx-3 h-px bg-line" />
              {([
                ["agree_privacy", "개인정보 수집·이용 동의", true, "privacy"],
                ["agree_policy", "이용약관과 환불·노쇼 정책 동의", true, "terms"],
                ["agree_marketing", "새 일정 소식 받기", false, null],
              ] as const).map(([k, l, req, d]) => (
                <div key={k} className="flex items-center gap-3 px-3 py-3.5 text-[15px]">
                  <button type="button" role="checkbox" aria-checked={v[k]} onClick={() => set(k, !v[k])} className="flex flex-1 items-center gap-3 text-left">
                    <span className={v[k] ? "text-accent" : "text-line"}><Check size={18} strokeWidth={3} /></span>
                    <span className={`text-[12px] font-bold ${req ? "text-accent" : "text-muted"}`}>{req ? "필수" : "선택"}</span>
                    <span className="flex-1">{l}</span>
                  </button>
                  {d && <button type="button" onClick={() => setDoc(d)} className="text-[13px] text-muted underline underline-offset-2">보기</button>}
                </div>
              ))}
            </div>
          </section>
        )}

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
