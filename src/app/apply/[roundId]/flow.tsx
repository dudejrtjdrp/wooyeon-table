"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PrimaryButton } from "@/components/client";
import { neighborsOf } from "@/lib/regions";

type Area = { name: string; open: boolean };
type Slot = { id: string; region: string; sido: string | null; day: string; label: string; startsAt: string };
type Pass = { key: string; label: string; amount: number; desc: string };

/** 받침에 따라 '로/으로' (ㄹ 받침은 '로') */
const ro = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return "로";
  const jong = c % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
};
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const CHECK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function ApplyFlow({
  action, round, sidos, hot, slots, passes, owned, refund, error,
}: {
  action: (f: FormData) => void | Promise<void>;
  round: { id: string; title: string; deadline: string; today: string };
  sidos: { name: string; areas: Area[] }[];
  hot: string[];
  slots: Slot[];
  passes: Pass[];
  owned: { label: string; remaining: number; until: string | null } | null;
  refund: string[];
  error?: string;
}) {
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]); // 묶음 이름 또는 "서울 전체"
  const [active, setActive] = useState(sidos[0]?.name ?? "서울");
  const [near, setNear] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [pass, setPass] = useState(owned ? "owned" : passes[0]?.key ?? "single");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ?? null);

  const sidoOf = (a: string) => (a.endsWith(" 전체") ? a.replace(/ 전체$/, "") : sidos.find((s) => s.areas.some((x) => x.name === a))?.name ?? "");
  const expanded = useMemo(() => {
    const out = new Set<string>();
    for (const p of picked) {
      if (p.endsWith(" 전체")) sidos.find((s) => `${s.name} 전체` === p)?.areas.forEach((a) => out.add(a.name));
      else out.add(p);
    }
    return out;
  }, [picked, sidos]);
  const countIn = (sido: string) => picked.filter((p) => sidoOf(p) === sido).length;

  const toggleArea = (name: string, sido: string) => {
    setMsg(null);
    setPicked((cur) => {
      const whole = `${sido} 전체`;
      if (name === whole) return cur.includes(whole) ? cur.filter((x) => x !== whole) : [...cur.filter((x) => sidoOf(x) !== sido), whole];
      const base = cur.filter((x) => x !== whole);
      return base.includes(name) ? base.filter((x) => x !== name) : [...base, name];
    });
  };

  const nb = neighborsOf(picked).map((a) => a.split("·")[0]);
  const nearLabel = nb.length ? `${nb.slice(0, 3).join("·")}${nb.length > 3 ? " 같은 곳" : ""}` : "";

  // 날짜 화면: 고른 동네에 테이블이 열리는 날
  const mineSlots = slots.filter((s) => expanded.has(s.region));
  const openDays = new Set(mineSlots.map((s) => s.day));
  const months = useMemo(() => {
    const ds = [...new Set(slots.map((s) => s.day))].sort();
    const ms = [...new Set(ds.map((d) => d.slice(0, 7)))];
    return ms.length ? ms : [round.today.slice(0, 7)];
  }, [slots, round.today]);
  const [mi, setMi] = useState(0);
  const month = months[Math.min(mi, months.length - 1)];

  const firstLabel = (d: string) => mineSlots.find((s) => s.day === d)?.label ?? d;

  const next = () => {
    if (step === 1 && !picked.length) return setMsg("동네를 하나 이상 골라주세요");
    if (step === 1 && !mineSlots.length) return setMsg("고른 동네에 이번 회차 테이블이 없어요. 다른 동네를 골라주세요");
    if (step === 2 && !days.length) return setMsg("갈 수 있는 날을 하나 이상 골라주세요");
    setMsg(null);
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  };

  const amount = pass === "owned" ? 0 : passes.find((p) => p.key === pass)?.amount ?? 0;
  const areaLabel = picked.length ? (picked.length === 1 ? picked[0] : `${picked[0]} 외 ${picked.length - 1}곳`) : "";
  const dayLabel = days.length ? [...days].sort().map((d) => `${Number(d.slice(8))}일`).join(", ") + (days.length > 1 ? " 중 하루" : "") : "";
  const sidoList = sidos.find((s) => s.name === active)!;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper">
      <div className="pt-safe">
        <div className="flex gap-1 px-6 pt-3" aria-hidden="true">
          {[1, 2, 3].map((i) => <span key={i} className={`h-[3px] flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />)}
        </div>
        <div className="flex items-center justify-between px-3 pt-2.5">
          {step === 1 ? (
            <Link href="/rounds" aria-label="닫기" className="flex size-11 items-center justify-center text-ink"><X size={22} /></Link>
          ) : (
            <button type="button" aria-label="이전 단계" onClick={() => { setMsg(null); setStep(step - 1); }} className="flex size-11 items-center justify-center text-ink"><ChevronLeft size={26} /></button>
          )}
          <span className="pr-3 text-[14px] tabular-nums text-muted">신청 {step} / 3</span>
        </div>
      </div>

      <form action={action} className="flex flex-1 flex-col" noValidate>
        <input type="hidden" name="round_id" value={round.id} />
        {picked.map((a) => <input key={a} type="hidden" name="areas" value={a} />)}
        {days.map((d) => <input key={d} type="hidden" name="dates" value={d} />)}
        {near && <input type="hidden" name="near_ok" value="on" />}
        <input type="hidden" name="pass" value={pass} />
        {agree && <input type="hidden" name="agree_refund" value="on" />}

        {step === 1 && (
          <>
            <div className="px-6 pt-2">
              <h1 className="text-[26px] font-extrabold leading-[1.38]">어디서 먹을 수 있어요?</h1>
              <p className="mt-2 text-[15px] text-muted">동네를 여러 곳 골라도 돼요.</p>
            </div>
            {picked.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 px-6 pt-4" aria-label="고른 동네">
                {picked.map((p) => (
                  <li key={p}>
                    <button type="button" onClick={() => toggleArea(p, sidoOf(p))} aria-label={`${p} 빼기`} className="flex h-11 items-center gap-1.5 rounded-[22px] bg-accent pl-3 pr-2.5 text-[14px] font-bold text-white">
                      {!p.endsWith(" 전체") && <span className="font-medium opacity-70">{sidoOf(p)}</span>}
                      {p}
                      <X size={13} strokeWidth={3} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex min-h-[360px] flex-1 border-t border-line2">
              <ul className="w-[112px] shrink-0 bg-field" aria-label="시·도">
                {sidos.map((s) => {
                  const on = s.name === active;
                  const n = countIn(s.name);
                  return (
                    <li key={s.name}>
                      <button type="button" aria-pressed={on} onClick={() => setActive(s.name)} className={`flex h-[52px] w-full items-center justify-between pl-[18px] pr-3.5 text-[15px] ${on ? "bg-paper font-extrabold text-ink" : "font-medium text-muted"}`}>
                        {s.name}
                        {n > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-white">{n}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <ul className="min-w-0 flex-1 pl-[18px] pr-5" aria-label={`${active} 동네`}>
                {[{ name: `${active} 전체`, open: sidoList.areas.some((a) => a.open) }, ...sidoList.areas].map((a) => {
                  const on = picked.includes(a.name) || (!a.name.endsWith(" 전체") && picked.includes(`${active} 전체`));
                  return (
                    <li key={a.name} className="border-b border-[#f1f4f2]">
                      <button type="button" role="checkbox" aria-checked={on} disabled={!a.open} onClick={() => toggleArea(a.name, active)} className="flex min-h-[52px] w-full items-center gap-2.5 py-2 text-left disabled:cursor-not-allowed">
                        <span className={`min-w-0 flex-1 text-[15px] ${on ? "font-extrabold text-accent-text" : a.open ? "text-ink2" : "text-[#b5c0ba]"}`}>
                          {a.name}
                          {!a.open && <span className="ml-1.5 text-[12px]">곧 열려요</span>}
                        </span>
                        {hot.includes(a.name) && <span className="shrink-0 rounded-[5px] bg-accent-soft px-1.5 py-[3px] text-[11px] font-bold text-accent">많이 골라요</span>}
                        <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-[6px] ${on ? "bg-accent" : a.open ? "bg-dot" : "bg-line2"}`}>{CHECK}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="px-6 pt-2">
              <h1 className="text-[26px] font-extrabold leading-[1.38]">갈 수 있는 날을<br />모두 골라주세요</h1>
              <p className="mt-2.5 text-[15px] text-muted">진하게 표시된 날에 테이블이 열려요.</p>
            </div>
            <div className="mx-4 mt-5 rounded-[20px] bg-field px-3 pb-3 pt-[18px]">
              <div className="flex items-center justify-between px-2 pb-3">
                <span className="text-[17px] font-extrabold">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</span>
                <div className="flex gap-1">
                  <button type="button" aria-label="이전 달" disabled={mi === 0} onClick={() => setMi(mi - 1)} className="flex size-11 items-center justify-center rounded-full bg-paper text-ink disabled:text-[#b5c0ba]"><ChevronLeft size={16} strokeWidth={2.4} /></button>
                  <button type="button" aria-label="다음 달" disabled={mi >= months.length - 1} onClick={() => setMi(mi + 1)} className="flex size-11 items-center justify-center rounded-full bg-paper text-ink disabled:text-[#b5c0ba]"><ChevronRight size={16} strokeWidth={2.4} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 pb-1.5 text-center text-[12px] text-faint">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {(() => {
                  const [y, m] = month.split("-").map(Number);
                  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
                  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
                  const cells: React.ReactNode[] = Array.from({ length: first }, (_, i) => <span key={`b${i}`} />);
                  for (let d = 1; d <= last; d++) {
                    const key = `${month}-${String(d).padStart(2, "0")}`;
                    const isOpen = openDays.has(key);
                    const on = days.includes(key);
                    const today = key === round.today;
                    cells.push(
                      <div key={key} className="flex h-12 items-center justify-center">
                        <button
                          type="button"
                          disabled={!isOpen}
                          aria-pressed={on}
                          aria-label={`${m}월 ${d}일${isOpen ? "" : ", 열린 테이블 없음"}`}
                          onClick={() => { setMsg(null); setDays((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key])); }}
                          className={`flex size-11 items-center justify-center rounded-full text-[15px] ${on ? "bg-accent font-extrabold text-white" : isOpen ? "bg-paper font-extrabold text-ink" : "font-medium text-[#b5c0ba]"} ${today && !on ? "ring-[1.5px] ring-inset ring-ink" : ""}`}
                        >
                          {d}
                        </button>
                      </div>,
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>
            {days.length > 0 && (
              <ul className="flex flex-col gap-2 px-6 pt-[18px]">
                {[...days].sort().map((d) => (
                  <li key={d} className="flex justify-between text-[14px]">
                    <span className="font-extrabold">{firstLabel(d)}</span>
                    <span className="text-muted">{round.deadline} 마감</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="px-6 pt-2">
              <h1 className="text-[26px] font-extrabold leading-[1.38]">이용권을 골라주세요</h1>
            </div>
            <div className="flex flex-col gap-2 px-4 pt-[22px]" role="radiogroup" aria-label="이용권">
              {owned && (
                <PassRow on={pass === "owned"} onClick={() => setPass("owned")} title="가지고 있는 이용권" sub={`${owned.label} 남은 ${owned.remaining}회${owned.until ? ` · ${owned.until}까지` : ""}`} price="0원" />
              )}
              {passes.map((p) => (
                <PassRow key={p.key} on={pass === p.key} onClick={() => setPass(p.key)} title={p.label} sub={p.desc} price={won(p.amount)} />
              ))}
            </div>
            <dl className="mx-6 mt-[18px]">
              {([
                ["지역", areaLabel],
                ["날짜", dayLabel],
                ["가까운 동네", near ? "괜찮아요" : "고른 동네만"],
                ["결제수단", amount ? "다음 화면에서 골라요" : "필요 없어요"],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line2 py-3 text-[15px] last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mx-6 mt-3.5 rounded-[14px] bg-field p-4 text-[13px] leading-[1.7] text-[#4a5a51]">
              <p className="mb-1 font-extrabold text-ink">환불 규정</p>
              {refund.map((r) => <p key={r}>{r}</p>)}
            </div>
            <button type="button" role="checkbox" aria-checked={agree} onClick={() => setAgree(!agree)} className="mx-6 mt-2 flex min-h-[48px] items-center gap-2.5 text-left text-[15px] font-bold">
              <span className={`flex size-[22px] items-center justify-center rounded-[6px] ${agree ? "bg-accent" : "bg-dot"}`}>{CHECK}</span>
              환불 규정을 확인했어요
            </button>
          </>
        )}

        <div className="h-48" />

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line2 bg-paper px-6 pt-3">
          {step === 1 && (
            <button type="button" role="checkbox" aria-checked={near} onClick={() => setNear(!near)} className="mb-2.5 flex min-h-[52px] w-full items-center gap-2.5 rounded-[14px] bg-field px-3.5 py-2 text-left">
              <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-[6px] ${near ? "bg-accent" : "bg-dot"}`}>{CHECK}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">가까운 동네도 괜찮아요</span>
                <span className="text-[12px] text-muted">{nearLabel ? `사람이 모자라면 바로 옆 ${nearLabel}${ro(nearLabel)} 잡아드려요` : "사람이 모자라면 바로 옆 동네로 잡아드려요"}</span>
              </span>
            </button>
          )}
          {msg && <p role="alert" className="mb-2.5 rounded-[12px] bg-danger/10 px-4 py-3 text-[14px] font-bold text-danger">{msg}</p>}
          <div className="pb-4">
            {step < 3 ? (
              <button type="button" onClick={next} className="flex h-[56px] w-full items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[17px] font-extrabold text-white active:scale-[.985]">
                다음
                {step === 1 && picked.length > 0 && <span className="font-medium opacity-70">{expanded.size}곳</span>}
                {step === 2 && days.length > 0 && <span className="font-medium opacity-70">{days.length}일</span>}
              </button>
            ) : (
              <PrimaryButton
                type="submit"
                pendingText="신청서 보내는 중"
                onClick={(e) => { if (!agree) { e.preventDefault(); setMsg("환불 규정을 확인해주세요"); } }}
              >
                {amount ? `${won(amount)} 결제하기` : "이용권으로 신청하기"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </form>
    </div>
  );

  function PassRow({ on, onClick, title, sub, price }: { on: boolean; onClick: () => void; title: string; sub: string; price: string }) {
    return (
      <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`flex items-center gap-3 rounded-[18px] p-[18px] text-left transition ${on ? "bg-accent-soft" : "bg-row"}`}>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent" : "bg-dot"}`}>{on && CHECK}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[17px] ${on ? "font-extrabold text-accent-text" : "font-bold"}`}>{title}</span>
          <span className={`mt-0.5 block text-[13px] ${on ? "text-[#4a5a51]" : "text-muted"}`}>{sub}</span>
        </span>
        <span className={`shrink-0 text-[17px] ${on ? "font-extrabold text-accent-text" : "font-bold"}`}>{price}</span>
      </button>
    );
  }
}
