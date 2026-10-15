"use client";

// 가입 흐름 (E안): 약관(E02) → 기본 정보(E03) → MBTI → 내 성향 → 만나고 싶은 사람(E04) → 관심사(E05) → 식사 조건(E06)
// 화면마다 질문 하나, 왼쪽 정렬 굵은 제목, 하단 꽉 찬 버튼, 상단 단계 막대.

import { ChevronLeft, X } from "lucide-react";
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
  name: string; birth_year: string; gender: string; job: string;
  mbti: string[]; // 네 글자 각각, 또는 ["unknown"]
  interests: string[]; my_traits: string[]; wanted_traits: string[]; wanted_any: boolean;
  price_range: string; avoid: string[]; allergy: string;
  agree_terms: boolean; agree_privacy: boolean; agree_policy: boolean; agree_marketing: boolean;
};

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

/** 고르면 연초록 배경 + 초록 원형 체크가 되는 줄 */
function Row({ on, onClick, children, sub, disabled, right }: { on: boolean; onClick: () => void; children: React.ReactNode; sub?: React.ReactNode; disabled?: boolean; right?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex min-h-[58px] w-full items-center gap-3 rounded-[16px] px-[18px] py-3 text-left text-[16px] transition ${on ? "bg-accent-soft font-extrabold text-accent-text" : "bg-row text-ink2"} ${disabled ? "opacity-45" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {sub && <span className={`mt-0.5 block text-[13px] font-normal ${on ? "text-[#4a5a51]" : "text-muted"}`}>{sub}</span>}
      </span>
      {right}
      <span className={`flex size-6 shrink-0 items-center justify-center rounded-full transition ${on ? "bg-accent" : "bg-dot"}`}>{CHECK}</span>
    </button>
  );
}

function Chip({ on, onClick, children, disabled, outline }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; outline?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`h-11 rounded-[22px] px-4 text-[15px] transition ${on ? "bg-accent font-extrabold text-white" : outline ? "border border-dot text-muted" : "bg-field text-ink2"} ${disabled ? "opacity-45" : ""}`}
    >
      {children}
    </button>
  );
}

/** 토스식 입력: 라벨 + 아래 밑줄, 지금 입력 중인 칸은 초록 밑줄 */
function LineField({ label, children, active }: { label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <label className="block">
      <span className={`text-[13px] ${active ? "font-bold text-accent" : "text-muted"}`}>{label}</span>
      <span className={`flex items-center pb-2.5 pt-2 ${active ? "border-b-2 border-accent" : "border-b border-line"}`}>{children}</span>
    </label>
  );
}
const lineInput = "min-w-0 flex-1 border-0 bg-transparent p-0 text-[20px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-[#b5c0ba]";

function DocSheet({ doc, onClose }: { doc: "terms" | "privacy" | null; onClose: () => void }) {
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button aria-label="닫기" className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-sheet pb-safe relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[24px] bg-card">
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <p className="text-[17px] font-extrabold">{doc === "terms" ? "이용약관" : "개인정보 처리방침"}</p>
          <button onClick={onClose} aria-label="닫기" className="-mr-2 flex size-11 items-center justify-center"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 text-[14px] leading-[1.75] [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-[15px] [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_ul]:mb-2">
          {doc === "terms" ? <TermsBody /> : <PrivacyBody />}
        </div>
        <div className="px-6 py-3">
          <button onClick={onClose} className="h-[52px] w-full rounded-[14px] bg-accent text-[16px] font-extrabold text-white">확인했어요</button>
        </div>
      </div>
    </div>
  );
}

const MBTI_AXES = [
  ["E", "I", "사람들과 있으면 힘이 나요", "혼자 있어야 충전돼요"],
  ["S", "N", "지금 눈앞의 것", "앞으로의 가능성"],
  ["T", "F", "논리로 판단해요", "마음이 먼저예요"],
  ["J", "P", "계획대로", "그때그때"],
] as const;

/** 만나고 싶은 사람 화면에서 성향을 사람으로 바꿔 보여준다 */
const PERSON: Record<string, string> = {
  "유쾌한": "농담이 잘 통하는 사람",
  "차분한": "차분하고 진중한 사람",
  "다정한": "이야기를 잘 들어주는 사람",
  "솔직한": "솔직하게 말하는 사람",
  "호기심 많은": "새로운 걸 좋아하는 사람",
  "리액션 좋은": "반응이 좋은 사람",
  "진지한": "깊은 대화를 좋아하는 사람",
  "에너지 넘치는": "대화를 먼저 꺼내는 사람",
};
const PRICE_SUB: Record<string, string> = { "1만 원대": "가볍게", "2만 원대": "적당히", "3만 원대": "제대로", "상관없어요": "어디든 좋아요" };

function parseFood(s: string | null | undefined, avoidList: readonly string[]) {
  const text = s ?? "";
  const avoid = avoidList.filter((x) => text.includes(x));
  const m = text.match(/알레르기:\s*(.+)$/);
  const allergy = m ? m[1].trim() : avoid.length || text.startsWith("못 먹는 음식") || text === "없어요" ? "" : text;
  return { avoid: text === "없어요" ? ["없어요"] : avoid, allergy };
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
  lists: { groups: { name: string; items: string[] }[]; traits: readonly string[]; mbtis: readonly string[]; prices: readonly string[]; avoid: readonly string[] };
  editing: boolean;
  verified: { name: string; phone: string | null; birthYear: number; gender: "M" | "F" | null } | null;
  idvOn: boolean;
  userKey: string;
  phoneVerified: boolean;
}) {
  // 0: 약관(처음 가입할 때만), 1~6: 프로필
  const first = editing ? 1 : 0;
  const LAST = 6;
  const storeKey = `wt_onb2_${userKey}`;
  const g0 = p?.gender ?? prefill.g;
  const food0 = parseFood(p?.food_restrictions, lists.avoid);
  const initial: Values = {
    name,
    birth_year: String(p?.birth_year ?? prefill.by ?? ""),
    gender: g0 === "M" ? "남성" : g0 === "F" ? "여성" : "",
    job: p?.job ?? "",
    mbti: p?.mbti ? p.mbti.split("") : editing ? ["unknown"] : [],
    interests: p?.interests ?? [],
    my_traits: p?.my_traits ?? [],
    wanted_traits: p?.wanted_traits ?? [],
    wanted_any: Boolean(p && (p.wanted_traits ?? []).length === 0),
    price_range: p?.price_range ?? "",
    avoid: food0.avoid,
    allergy: food0.allergy,
    agree_terms: Boolean(p?.agreed_at),
    agree_privacy: Boolean(p?.agreed_at),
    agree_policy: Boolean(p?.agreed_at),
    agree_marketing: Boolean(p?.marketing_opt_in),
  };
  const [v, setV] = useState<Values>(initial);
  const [step, setStep] = useState(first);
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
        setStep(Math.max(first, Math.min(s.step ?? first, LAST)));
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
  const toggle = (k: "interests" | "my_traits" | "wanted_traits", x: string, max: number) =>
    setV((cur) => {
      const list = cur[k];
      if (list.includes(x)) return { ...cur, [k]: list.filter((y) => y !== x), ...(k === "wanted_traits" ? { wanted_any: false } : {}) };
      if (list.length >= max) return cur;
      return { ...cur, [k]: [...list, x], ...(k === "wanted_traits" ? { wanted_any: false } : {}) };
    });
  const years = Array.from({ length: 2007 - 1970 + 1 }, (_, i) => 2007 - i);
  const mbtiStr = v.mbti.length === 4 && v.mbti.every((x) => x !== "unknown") ? v.mbti.join("") : v.mbti[0] === "unknown" ? "unknown" : "";

  const check = (i: number): string | null => {
    if (i === 0 && !(v.agree_terms && v.agree_privacy && v.agree_policy)) return "필수 항목에 모두 동의해 주세요";
    if (i === 1) {
      if (idvOn && !verified) return "PASS 본인인증을 먼저 해 주세요";
      if (!verified && !phoneVerified) return "휴대폰 번호 인증을 먼저 해 주세요";
      if (!verified && v.name.trim().length < 2) return "이름을 두 글자 이상 적어 주세요";
      if (!verified && !v.gender) return "성별을 골라 주세요";
      if (!verified && !v.birth_year) return "출생연도를 골라 주세요";
      if (!v.job.trim()) return "하는 일을 적어 주세요";
    }
    if (i === 2 && !mbtiStr) return "네 줄을 모두 고르거나 '잘 모르겠어요'를 눌러 주세요";
    if (i === 3 && v.my_traits.length < 1) return "하나 이상 골라 주세요";
    if (i === 4 && v.wanted_traits.length < 1 && !v.wanted_any) return "하나 이상 골라 주세요";
    if (i === 5 && v.interests.length < 2) return "두 개 이상 골라 주세요";
    if (i === 6 && !v.price_range) return "가격대를 골라 주세요";
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

  const verifyHref = `/verify/phone?next=${encodeURIComponent(`/onboarding?next=${next}`)}`;
  const hiddenGender = verified?.gender === "M" ? "남성" : verified?.gender === "F" ? "여성" : v.gender;
  const food = v.avoid.includes("없어요")
    ? v.allergy ? `알레르기: ${v.allergy}` : "없어요"
    : [v.avoid.length ? `못 먹는 음식: ${v.avoid.join(", ")}` : "", v.allergy ? `알레르기: ${v.allergy}` : ""].filter(Boolean).join(" / ");
  const allAgree = v.agree_terms && v.agree_privacy && v.agree_policy && v.agree_marketing;

  const titles: Record<number, [React.ReactNode, React.ReactNode?]> = {
    0: [<>시작하기 전에<br />확인해주세요</>, <>처음 보는 사람들과 만나는 자리라<br />안전하게 운영하려고 받는 동의예요.</>],
    1: [editing ? "기본 정보를 확인해주세요" : "어떤 분인지 알려주세요", "테이블 소개할 때 하는 일 정도만 보여줘요."],
    2: ["MBTI를 골라주세요", "줄마다 하나씩요. 몰라도 괜찮아요."],
    3: [<>나는 어떤 사람에<br />가까워요?</>, "3개까지 고를 수 있어요."],
    4: [<>어떤 사람과<br />같은 테이블이면 좋겠어요?</>, "3개까지 고를 수 있어요."],
    5: ["요즘 뭐에 빠져 있어요?", "겹치는 사람이 있으면 대화가 쉬워져요. 5개까지요."],
    6: [<>식당 고를 때<br />알아둘 게 있을까요?</>],
  };
  const countLabel = step === 3 ? `${v.my_traits.length}/3` : step === 4 ? (v.wanted_any ? "" : `${v.wanted_traits.length}/3`) : step === 5 ? `${v.interests.length}/5` : "";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <div className="pt-safe">
        {step > 0 && (
          <div className="flex gap-1 px-6 pt-3" aria-hidden="true">
            {Array.from({ length: LAST }, (_, i) => (
              <span key={i} className={`h-[3px] flex-1 rounded-full transition-colors ${i < step ? "bg-accent" : "bg-line"}`} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between px-3 pt-2.5">
          {step > first ? (
            <button type="button" aria-label="이전 단계" onClick={() => go(step - 1)} className="flex size-11 items-center justify-center text-ink"><ChevronLeft size={26} /></button>
          ) : editing ? (
            <Link href={next} aria-label="닫기" className="flex size-11 items-center justify-center text-ink"><X size={22} /></Link>
          ) : <span className="size-11" />}
          {step > 0 && <span className="pr-3 text-[14px] tabular-nums text-muted">{step} / {LAST}</span>}
        </div>
      </div>

      <div className="px-6 pt-3">
        <h1 key={step} className="animate-rise text-[26px] font-extrabold leading-[1.38] text-ink">{titles[step][0]}</h1>
        {titles[step][1] && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{titles[step][1]}</p>}
      </div>

      <form
        action={action}
        onSubmit={() => { try { sessionStorage.removeItem(storeKey); } catch {} }}
        className="flex flex-1 flex-col pb-36"
        noValidate
      >
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="name" value={verified?.name ?? v.name} />
        <input type="hidden" name="phone" value={verified?.phone ?? phone ?? ""} />
        <input type="hidden" name="birth_year" value={verified ? String(verified.birthYear) : v.birth_year} />
        <input type="hidden" name="gender" value={hiddenGender} />
        <input type="hidden" name="job" value={v.job} />
        <input type="hidden" name="mbti" value={mbtiStr} />
        {v.interests.map((x) => <input key={`i-${x}`} type="hidden" name="interests" value={x} />)}
        {v.my_traits.map((x) => <input key={`m-${x}`} type="hidden" name="my_traits" value={x} />)}
        {v.wanted_traits.map((x) => <input key={`w-${x}`} type="hidden" name="wanted_traits" value={x} />)}
        {v.wanted_any && <input type="hidden" name="wanted_any" value="on" />}
        <input type="hidden" name="price_range" value={v.price_range} />
        <input type="hidden" name="food_restrictions" value={food} />
        {(v.agree_privacy || editing) && <input type="hidden" name="agree_privacy" value="on" />}
        {((v.agree_policy && v.agree_terms) || editing) && <input type="hidden" name="agree_policy" value="on" />}
        {v.agree_marketing && <input type="hidden" name="agree_marketing" value="on" />}

        {step === 0 && (
          <section className="px-4 pt-8">
            <button
              type="button"
              role="checkbox"
              aria-checked={allAgree}
              onClick={() => setV((c) => ({ ...c, agree_terms: !allAgree, agree_privacy: !allAgree, agree_policy: !allAgree, agree_marketing: !allAgree }))}
              className={`flex h-16 w-full items-center gap-3 rounded-[16px] px-[18px] text-left transition ${allAgree ? "bg-accent-soft" : "bg-row"}`}
            >
              <span className={`flex size-[26px] items-center justify-center rounded-full ${allAgree ? "bg-accent" : "bg-dot"}`}>{CHECK}</span>
              <span className={`text-[17px] font-extrabold ${allAgree ? "text-accent-text" : "text-ink"}`}>모두 동의할게요</span>
            </button>
            <ul className="mt-2.5 px-2">
              {([
                ["agree_terms", "[필수]", "서비스 이용약관", "terms"],
                ["agree_privacy", "[필수]", "개인정보 수집·이용", "privacy"],
                ["agree_policy", "[필수]", "운영 정책 (환불·노쇼)", "terms"],
                ["agree_marketing", "[선택]", "새 일정 알림 받기", null],
              ] as const).map(([k, tag, label, d]) => (
                <li key={k} className="flex items-center gap-1">
                  <button type="button" role="checkbox" aria-checked={v[k]} onClick={() => set(k, !v[k])} className="flex min-h-[52px] flex-1 items-center gap-3 text-left">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={v[k] ? "var(--accent)" : "#c9d2cd"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    <span className="text-[15px] text-ink2"><span className={`font-bold ${tag === "[필수]" ? "text-accent" : "text-faint"}`}>{tag}</span> {label}</span>
                  </button>
                  {d && <button type="button" onClick={() => setDoc(d)} className="flex h-11 items-center px-2 text-[13px] text-faint underline underline-offset-[3px]">보기</button>}
                </li>
              ))}
            </ul>
            <div className="mx-2 mt-3 rounded-[12px] bg-field px-4 py-3.5 text-[13px] leading-relaxed text-[#4a5a51]">
              모임 2일 전부터는 환불이 안 되고, 당일에는 취소나 단체방 나가기를 할 수 없어요.
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-7 px-6 pt-8">
            {verified ? (
              <div className="rounded-[16px] bg-accent-soft px-[18px] py-4">
                <p className="text-[13px] font-bold text-accent-text">본인인증을 마쳤어요</p>
                <p className="mt-1 text-[18px] font-extrabold">{verified.name}</p>
                <p className="text-[14px] text-[#4a5a51]">{verified.birthYear}년생 · {verified.gender === "M" ? "남성" : verified.gender === "F" ? "여성" : ""}</p>
              </div>
            ) : idvOn ? (
              <div className="rounded-[16px] bg-field p-[18px]">
                <p className="text-[16px] font-extrabold">안전한 자리를 위해 본인인증이 필요해요</p>
                <p className="mb-4 mt-1 text-[14px] leading-relaxed text-muted">이름·나이·성별을 확인해요. 다른 참가자에게 나이와 번호는 안 보여요.</p>
                <PassButton userKey={userKey} next={next} onError={setMsg} />
              </div>
            ) : null}

            <LineField label="하는 일" active>
              <input value={v.job} onChange={(e) => set("job", e.target.value)} placeholder="예: UX 디자이너" className={lineInput} />
            </LineField>

            {!verified && !idvOn && (
              <>
                <div>
                  <span className="text-[13px] text-muted">성별</span>
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                    {["여성", "남성"].map((x) => (
                      <button key={x} type="button" aria-pressed={v.gender === x} onClick={() => set("gender", x)} className={`flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] text-[16px] transition ${v.gender === x ? "bg-accent-soft font-extrabold text-accent-text" : "bg-field font-semibold text-[#4a5a51]"}`}>
                        {v.gender === x && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                        {x}
                      </button>
                    ))}
                  </div>
                </div>
                <LineField label="출생연도">
                  <select value={v.birth_year} onChange={(e) => set("birth_year", e.target.value)} className={`${lineInput} appearance-none`}>
                    <option value="" disabled>골라주세요</option>
                    {years.map((y) => <option key={y} value={y}>{y}년생</option>)}
                  </select>
                </LineField>
                <LineField label="이름">
                  <input value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="실명" className={lineInput} />
                </LineField>
                <div>
                  <span className="text-[13px] text-muted">휴대폰 번호</span>
                  {phoneVerified ? (
                    <div className="flex items-center justify-between border-b border-line pb-2.5 pt-2">
                      <span className="text-[20px] font-bold text-[#4a5a51]">{(phone ?? "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3")}</span>
                      <span className="flex items-center gap-3 text-[13px]"><span className="font-bold text-accent">인증했어요</span><Link href={verifyHref} className="flex h-11 items-center text-faint underline underline-offset-2">바꾸기</Link></span>
                    </div>
                  ) : (
                    <Link href={verifyHref} className="mt-2 flex h-[52px] items-center justify-center rounded-[14px] bg-accent-soft text-[16px] font-extrabold text-accent-text">휴대폰 번호 인증하기</Link>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-2.5 px-4 pt-7">
            {MBTI_AXES.map(([a, b, da, db], i) => (
              <div key={a} className="grid grid-cols-2 gap-2">
                {([[a, da], [b, db]] as const).map(([k, d]) => {
                  const on = v.mbti[i] === k;
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setV((c) => { const m = c.mbti[0] === "unknown" ? [] : [...c.mbti]; m[i] = k; return { ...c, mbti: m }; })} className={`flex min-h-[64px] flex-col justify-center rounded-[16px] px-4 py-2.5 text-left transition ${on ? "bg-accent-soft" : "bg-row"}`}>
                      <span className={`text-[18px] font-black ${on ? "text-accent-text" : "text-ink2"}`}>{k}</span>
                      <span className={`text-[12px] leading-snug ${on ? "text-[#4a5a51]" : "text-muted"}`}>{d}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <button type="button" aria-pressed={v.mbti[0] === "unknown"} onClick={() => set("mbti", v.mbti[0] === "unknown" ? [] : ["unknown"])} className={`mt-1 h-[52px] rounded-[14px] text-[15px] transition ${v.mbti[0] === "unknown" ? "bg-accent font-extrabold text-white" : "border border-dot text-muted"}`}>잘 모르겠어요</button>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-2 px-4 pt-7">
            {lists.traits.map((t) => (
              <Row key={t} on={v.my_traits.includes(t)} disabled={!v.my_traits.includes(t) && v.my_traits.length >= 3} onClick={() => toggle("my_traits", t, 3)}>{t} 편이에요</Row>
            ))}
          </section>
        )}

        {step === 4 && (
          <section className="flex flex-col gap-2 px-4 pt-7">
            {lists.traits.map((t) => (
              <Row key={t} on={v.wanted_traits.includes(t)} disabled={!v.wanted_traits.includes(t) && v.wanted_traits.length >= 3} onClick={() => toggle("wanted_traits", t, 3)}>{PERSON[t] ?? `${t} 사람`}</Row>
            ))}
            <Row on={v.wanted_any} onClick={() => setV((c) => ({ ...c, wanted_any: !c.wanted_any, wanted_traits: [] }))}>상관없어요, 다 좋아요</Row>
          </section>
        )}

        {step === 5 && (
          <section className="flex flex-col gap-5 px-6 pt-6">
            {lists.groups.map((g) => (
              <div key={g.name}>
                <p className="text-[13px] font-bold text-muted">{g.name}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {g.items.map((x) => (
                    <Chip key={x} on={v.interests.includes(x)} disabled={!v.interests.includes(x) && v.interests.length >= 5} onClick={() => toggle("interests", x, 5)}>{x}</Chip>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {step === 6 && (
          <section className="px-6 pt-6">
            <p className="text-[14px] font-extrabold text-ink2">한 끼 가격대</p>
            <div className="mt-3 flex flex-col gap-2">
              {lists.prices.map((o) => {
                const on = v.price_range === o;
                return (
                  <button key={o} type="button" role="radio" aria-checked={on} onClick={() => set("price_range", o)} className={`flex h-[54px] items-center justify-between rounded-[14px] px-[18px] text-[16px] transition ${on ? "bg-accent-soft font-extrabold text-accent-text" : "bg-row text-ink2"}`}>
                    {PRICE_SUB[o] ?? o}
                    <span className={`text-[14px] ${on ? "font-bold" : "text-faint"}`}>{o}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-7 text-[14px] font-extrabold text-ink2">못 먹는 음식</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lists.avoid.map((x) => (
                <Chip key={x} on={v.avoid.includes(x)} onClick={() => setV((c) => ({ ...c, avoid: c.avoid.includes(x) ? c.avoid.filter((y) => y !== x) : [...c.avoid.filter((y) => y !== "없어요"), x] }))}>{x}</Chip>
              ))}
              <Chip outline on={v.avoid.includes("없어요")} onClick={() => set("avoid", v.avoid.includes("없어요") ? [] : ["없어요"])}>없어요</Chip>
            </div>
            <label htmlFor="allergy" className="mt-5 block text-[13px] text-muted">알레르기가 있으면 적어주세요</label>
            <input id="allergy" value={v.allergy} onChange={(e) => set("allergy", e.target.value.slice(0, 80))} placeholder="예: 복숭아" className="mt-2 h-[50px] w-full rounded-[12px] bg-field px-4 text-[15px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent" />
          </section>
        )}

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-paper px-6 pt-3">
          {msg && <p role="alert" className="mb-2.5 rounded-[12px] bg-danger/10 px-4 py-3 text-[14px] font-bold text-danger">{msg}</p>}
          <div className="pb-4">
            {step < LAST ? (
              <button type="button" onClick={goNext} className="flex h-[56px] w-full items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[17px] font-extrabold text-white active:scale-[.985]">
                {step === 0 ? "동의하고 시작하기" : "다음"}
                {countLabel && <span className="font-medium opacity-70">{countLabel}</span>}
              </button>
            ) : (
              <PrimaryButton
                type="submit"
                pendingText="저장하는 중"
                onClick={(e) => {
                  for (let i = first; i <= LAST; i++) {
                    const err = check(i);
                    if (err) { e.preventDefault(); go(i); setMsg(err); return; }
                  }
                }}
              >
                {editing ? "저장하기" : "프로필 다 만들었어요"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </form>
      <DocSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
