"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PrimaryButton } from "@/components/client";
import { neighborsOf } from "@/lib/regions";
import { stepFromUrl, useStepHistory } from "@/lib/use-step-history";

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
/** 체크칸: 안 고르면 빈 칸(테두리만), 고르면 채운 칸 + 체크. 안 고른 칸에 회색 체크가 보여 고른 것처럼 보이던 문제를 막는다 */
const Box = ({ on, round = false, size = 22 }: { on: boolean; round?: boolean; size?: number }) => (
  <span style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center ${round ? "rounded-full" : "rounded-[6px]"} ${on ? "bg-accent" : "border-2 border-box bg-card"}`}>{on && CHECK}</span>
);

export function ApplyFlow({
  action, round, sidos, hot, slots, passes, owned, refund, error, nudge = null, initialStep = 1,
}: {
  action: (f: FormData) => void | Promise<void>;
  round: { id: string; title: string; deadline: string; today: string };
  sidos: { name: string; areas: Area[] }[];
  hot: string[];
  slots: Slot[];
  passes: Pass[];
  owned: { label: string; remaining: number; unlimited: boolean; until: string | null } | null;
  refund: string[];
  error?: string;
  /** 두 번째 신청부터 멤버십 권유 (추천 표시와 계산만, 기본 선택은 그대로) */
  nudge?: { key: string; note: string } | null;
  /** 주소의 ?step= (뒤로 가기로 돌아왔을 때 첫 화면이 1단계로 깜빡이지 않게) */
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [picked, setPicked] = useState<string[]>([]); // 묶음 이름 또는 "서울 전체"
  const [active, setActive] = useState(sidos[0]?.name ?? "서울");
  const [near, setNear] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [pass, setPass] = useState(owned ? "owned" : passes[0]?.key ?? "single");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ?? null);

  // 결제 화면이나 오류에서 뒤로 돌아와도 고른 동네·날짜·이용권과 단계를 이어 간다
  const storeKey = `apply:${round.id}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storeKey);
      const back = stepFromUrl() !== null;
      if (saved && (back || error)) {
        const s = JSON.parse(saved) as { picked: string[]; days: string[]; pass: string; near: boolean; step: number };
        setPicked(s.picked ?? []);
        setDays(s.days ?? []);
        if (s.pass) setPass(s.pass);
        setNear(s.near ?? true);
        if (error) setStep(Math.min(Math.max(s.step ?? 1, 1), 3));
      }
    } catch {}
    // 같은 순간에 도는 저장이 아직 비어 있는 초기값으로 저장해 둔 내용을 덮어쓰지 않게, 불러온 값이 반영된 뒤부터 저장한다
    queueMicrotask(() => { restored.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify({ picked, days, pass, near, step })); } catch {}
  }, [picked, days, pass, near, step, storeKey]);
  // 휴대폰 뒤로 가기가 신청 첫 단계나 일정 목록이 아니라 바로 앞 단계로 가게
  const nav = useStepHistory(step, setStep, [1, 3]);

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

  // 안내 문구에는 이번에 테이블이 열린 옆 동네만 적는다 (안 여는 동네를 적으면 거기서도 모이는 줄 안다)
  const openNames = new Set(sidos.flatMap((s) => s.areas.filter((a) => a.open).map((a) => a.name)));
  const nb = neighborsOf(picked).filter((a) => openNames.has(a)).map((a) => a.split("·")[0]);
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
    if (step === 1 && !mineSlots.length) return setMsg("고른 동네에는 이번 일정 테이블이 없어요. 다른 동네를 더 골라 주세요");
    if (step === 2 && !days.length) return setMsg("갈 수 있는 날을 하나 이상 골라주세요");
    setMsg(null);
    nav.push(step + 1);
    window.scrollTo({ top: 0 });
  };

  const amount = pass === "owned" ? 0 : passes.find((p) => p.key === pass)?.amount ?? 0;
  const areaLabel = picked.length ? (picked.length === 1 ? picked[0] : `${picked[0]} 외 ${picked.length - 1}곳`) : "";
  const dayLabel = days.length ? [...days].sort().map((d) => `${Number(d.slice(8))}일`).join(", ") + (days.length > 1 ? " 중 하루" : "") : "";
  const sidoList = sidos.find((s) => s.name === active)!;
  // 시·도 탭은 이번에 테이블이 열린 곳만. 아직 안 여는 시·도는 목록 아래 '다른 지역 원해요' 한 줄로 보낸다
  const openSidos = sidos.filter((s) => s.areas.some((a) => a.open));
  const tabs = openSidos.length ? openSidos : sidos.slice(0, 1);
  const closedSidos = sidos.filter((s) => !tabs.includes(s));
  const openAreas = sidoList.areas.filter((a) => a.open);
  const closedAreas = sidoList.areas.filter((a) => !a.open);

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
            <button type="button" aria-label="이전 단계" onClick={() => { setMsg(null); nav.back(step - 1); window.scrollTo({ top: 0 }); }} className="flex size-11 items-center justify-center text-ink"><ChevronLeft size={26} /></button>
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
            <div className="mt-4 flex flex-1 border-t border-line2">
              {tabs.length > 1 && (
              <ul className="w-[112px] shrink-0 bg-field" aria-label="시·도">
                {tabs.map((s) => {
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
              )}
              <div className={`min-w-0 flex-1 ${tabs.length > 1 ? "pl-[18px] pr-5" : "px-6"}`}>
                {tabs.length === 1 && <p className="pt-4 text-[13px] font-bold text-muted">{active}에서 지금 모여요</p>}
                <ul aria-label={`${active} 동네`}>
                  {/* 지금 테이블이 열린 동네만 고를 수 있게 먼저 보여 준다 */}
                  {[...(openAreas.length > 1 ? [{ name: `${active} 전체`, open: true }] : []), ...openAreas].map((a) => {
                    const on = picked.includes(a.name) || (!a.name.endsWith(" 전체") && picked.includes(`${active} 전체`));
                    return (
                      <li key={a.name} className="border-b border-line2">
                        <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleArea(a.name, active)} className="flex min-h-[52px] w-full items-center gap-2.5 py-2 text-left">
                          <span className={`min-w-0 flex-1 text-[15px] ${on ? "font-extrabold text-accent-text" : "text-ink2"}`}>{a.name}</span>
                          {hot.includes(a.name) && <span className="shrink-0 rounded-[5px] bg-accent-soft px-1.5 py-[3px] text-[11px] font-bold text-accent">많이 골라요</span>}
                          <Box on={on} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {/* 아직 안 여는 동네는 접어 두고, 펼치면 수요 조사(열리면 알림)로 보낸다 (운영사 Q&A: 서울 4곳 먼저) */}
                {closedAreas.length > 0 && (
                  <details className="group/closed border-b border-line2">
                    <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 text-[14px] text-muted">
                      <span className="flex-1">아직 안 여는 동네 {closedAreas.length}곳</span>
                      <ChevronRight size={16} className="transition group-open/closed:rotate-90" aria-hidden="true" />
                    </summary>
                    <ul className="pb-2">
                      {closedAreas.map((a) => (
                        <li key={a.name}>
                          <Link href={`/wish?area=${encodeURIComponent(a.name)}`} className="flex min-h-11 items-center gap-2.5 text-left">
                            <span className="min-w-0 flex-1 text-[14px] text-muted">{a.name}</span>
                            <span className="shrink-0 text-[12px] font-bold text-accent">열리면 알림</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <Link href="/wish" className="flex min-h-[52px] items-center text-[13px] font-bold text-accent underline underline-offset-4">
                  {closedSidos.length ? `다른 지역 원해요 (${closedSidos.slice(0, 3).map((s) => s.name).join("·")} 등)` : "찾는 동네가 없나요? 원하는 곳 남기기"}
                </Link>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="px-6 pt-2">
              <h1 className="text-[26px] font-extrabold leading-[1.38]">갈 수 있는 날을<br />모두 골라주세요</h1>
              <p className="mt-2.5 text-[15px] text-muted">동그라미 친 날만 테이블이 열려요.</p>
            </div>
            <div className="mx-4 mt-5 rounded-[20px] bg-field px-3 pb-3 pt-[18px]">
              <div className="flex items-center justify-between px-2 pb-3">
                <span className="text-[17px] font-extrabold">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</span>
                <div className="flex gap-1">
                  <button type="button" aria-label="이전 달" disabled={mi === 0} onClick={() => setMi(mi - 1)} className="flex size-11 items-center justify-center rounded-full bg-paper text-ink disabled:text-[#9a8c7e]"><ChevronLeft size={16} strokeWidth={2.4} /></button>
                  <button type="button" aria-label="다음 달" disabled={mi >= months.length - 1} onClick={() => setMi(mi + 1)} className="flex size-11 items-center justify-center rounded-full bg-paper text-ink disabled:text-[#9a8c7e]"><ChevronRight size={16} strokeWidth={2.4} /></button>
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
                          className={`flex size-11 items-center justify-center rounded-full text-[15px] ${on ? "bg-accent font-extrabold text-white" : isOpen ? "bg-paper font-extrabold text-ink" : "font-medium text-muted/60"} ${today && !on ? "ring-[1.5px] ring-inset ring-ink" : ""}`}
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
            {nudge && <p className="mx-6 mt-3 rounded-[14px] bg-accent-soft px-4 py-3 text-[14px] leading-relaxed text-accent-text">{nudge.note}</p>}
            <div className="flex flex-col gap-2 px-4 pt-[22px]" role="radiogroup" aria-label="이용권">
              {owned && (
                <PassRow on={pass === "owned"} onClick={() => setPass("owned")} title="가지고 있는 이용권" sub={`${owned.label} ${owned.unlimited ? "기간 안 무제한" : `남은 ${owned.remaining}회`}${owned.until ? ` · ${owned.until}까지` : ""}`} price="0원" />
              )}
              {passes.map((p) => (
                <PassRow key={p.key} on={pass === p.key} onClick={() => setPass(p.key)} title={p.label} sub={p.desc} price={won(p.amount)} badge={nudge?.key === p.key ? "추천" : undefined} />
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
            {/* 환불 규정: 핵심 한 줄만 보이고 나머지는 펼쳐 본다 (동의 전에 읽을 수 있게 그대로 둔다) */}
            {/* 결제 전에는 환불 마감·당일 취소·노쇼 세 줄을 늘 보여 주고, 나머지만 접는다 (details 안의 summary 앞 내용은 접히면 안 보여서 밖에 둔다) */}
            <div className="mx-6 mt-3.5 rounded-[14px] bg-card px-4 pt-3.5 text-[13px] leading-[1.7] text-ink2">
              <p className="font-bold text-ink">환불 규정</p>
              {[0, 2, 3].map((i) => refund[i] && <p key={i}>{refund[i]}</p>)}
            <details className="group/refund">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] font-semibold text-accent group-open/refund:hidden">나머지 규정 보기</summary>
              <div className="pb-4">{refund.filter((_, i) => ![0, 2, 3].includes(i)).map((r) => <p key={r}>{r}</p>)}</div>
            </details>
            </div>
            <button type="button" role="checkbox" aria-checked={agree} onClick={() => setAgree(!agree)} className="mx-6 mt-2 flex min-h-[48px] items-center gap-2.5 text-left text-[15px] font-bold">
              <Box on={agree} />
              환불 규정을 확인했어요
            </button>
          </>
        )}

        <div className="h-48" />

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line2 bg-paper px-6 pt-3">
          {step === 1 && (
            <button type="button" role="checkbox" aria-checked={near} onClick={() => setNear(!near)} className="mb-2.5 flex min-h-[52px] w-full items-center gap-2.5 rounded-[14px] bg-field px-3.5 py-2 text-left">
              <Box on={near} />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">가까운 동네도 괜찮아요</span>
                <span className="text-[12px] text-muted">{nearLabel ? `사람이 모자라면 바로 옆 ${nearLabel}${ro(nearLabel)} 잡아드려요` : "사람이 모자라면 바로 옆 동네로 잡아드려요"}</span>
              </span>
            </button>
          )}
          {msg && <p role="alert" className="mb-2.5 rounded-[12px] bg-danger/10 px-4 py-3 text-[14px] font-bold text-danger">{msg}</p>}
          <div className="pb-4">
            {step < 3 ? (
              <button type="button" onClick={next} className="flex h-[56px] w-full items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[16px] font-bold text-accent-ink active:scale-[.985]">
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

  function PassRow({ on, onClick, title, sub, price, badge }: { on: boolean; onClick: () => void; title: string; sub: string; price: string; badge?: string }) {
    return (
      <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`flex items-center gap-3 rounded-[18px] p-[18px] text-left transition ${on ? "bg-accent-soft" : "bg-row"}`}>
        <Box on={on} round size={24} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-[17px] ${on ? "font-extrabold text-accent-text" : "font-bold"}`}>{title}{badge && <span className="rounded-[5px] bg-accent px-1.5 py-[2px] text-[11px] font-bold text-white">{badge}</span>}</span>
          <span className={`mt-0.5 block text-[13px] ${on ? "text-ink2" : "text-muted"}`}>{sub}</span>
        </span>
        <span className={`shrink-0 text-[17px] ${on ? "font-extrabold text-accent-text" : "font-bold"}`}>{price}</span>
      </button>
    );
  }
}
