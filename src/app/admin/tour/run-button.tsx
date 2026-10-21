"use client";

import { Check, LoaderCircle, RotateCw } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState, useTransition } from "react";
import { TOUR_POLL_MS, type TourStepKey, phaseIndex, pollVerdict } from "@/lib/tour";
import { tourNext } from "./actions";

/**
 * 투어 버튼. 누르면 진행 모달이 뜨고 '지금 하는 일'이 차례로 바뀐다.
 * 서버 응답이 늦거나 끊겨도 몇 초마다 단계를 다시 물어봐서, 바뀌면 화면을 새로 연다
 */
export function TourRunButton({ send, current, progress, title, disabled, className, children }: {
  send: TourStepKey;
  current: TourStepKey;
  progress: string[];
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tickAt, setTickAt] = useState(0);
  const [seen, setSeen] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (startedAt || disabled) return;
    const fd = new FormData(e.currentTarget);
    const t0 = Date.now();
    setStartedAt(t0);
    setTickAt(t0);
    startTransition(async () => {
      try {
        await tourNext(fd);
      } catch {
        // 응답이 끊겨도 서버는 계속 처리하고 있을 수 있다. 아래 상태 조회가 이어받는다
        setLost(true);
      }
    });
  }

  useEffect(() => {
    if (!startedAt) return;
    const clock = setInterval(() => setTickAt(Date.now()), 500);
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/tour-state", { cache: "no-store" });
        const j = (await r.json()) as { step?: string };
        if (j.step) setSeen(j.step);
      } catch {
        /* 다음 조회에서 다시 */
      }
    }, TOUR_POLL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [startedAt]);

  const elapsed = startedAt ? tickAt - startedAt : 0;
  const verdict = startedAt ? pollVerdict(current, seen, elapsed) : "wait";

  // 단계가 바뀌었는데 화면이 안 넘어가면, 마무리할 틈을 조금 준 뒤 새로 연다
  useEffect(() => {
    if (verdict !== "changed") return;
    const id = setTimeout(() => window.location.replace(`/admin/tour?m=${encodeURIComponent("처리가 끝났어요. 결과를 확인해 보세요")}&t=${Date.now()}#now`), 2500);
    return () => clearTimeout(id);
  }, [verdict]);

  const at = verdict === "changed" ? progress.length : phaseIndex(elapsed, progress.length);
  const reload = () => window.location.replace(`/admin/tour?t=${Date.now()}#now`);

  return (
    <form onSubmit={onSubmit} className="contents">
      <input type="hidden" name="step" value={send} />
      <button type="submit" disabled={disabled || !!startedAt} className={`${className ?? ""} disabled:opacity-60`}>
        {children}
      </button>
      {startedAt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4" role="dialog" aria-modal="true" aria-labelledby="tour-run-title">
          <div className="w-full max-w-[420px] rounded-[20px] bg-card p-6 shadow-card">
            <p className="text-[13px] font-semibold text-accent">처리하는 중 · {Math.floor(elapsed / 1000)}초</p>
            <h2 id="tour-run-title" className="mt-1 text-[19px] font-bold text-ink">{title}</h2>
            <ol className="mt-4 space-y-2.5" aria-live="polite">
              {progress.map((p, i) => {
                const state = i < at ? "done" : i === at ? "now" : "later";
                return (
                  <li key={p} className={`flex items-center gap-2.5 text-[15px] ${state === "later" ? "text-muted" : "text-ink"} ${state === "now" ? "font-semibold" : ""}`}>
                    <span className="flex size-6 shrink-0 items-center justify-center">
                      {state === "done" ? <Check size={18} className="text-leaf" aria-label="끝" /> : state === "now" ? <LoaderCircle size={18} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" /> : <span className="size-2 rounded-full bg-line" aria-hidden="true" />}
                    </span>
                    {p}
                  </li>
                );
              })}
            </ol>
            {verdict === "changed" && <p className="mt-4 rounded-xl bg-leaf-soft px-3.5 py-2.5 text-[14px] font-semibold text-leaf">끝났어요. 결과 화면으로 넘어가요</p>}
            {verdict === "wait" && lost && <p className="mt-4 rounded-xl bg-field px-3.5 py-2.5 text-[13px] text-ink2">화면 연결이 잠깐 끊겼지만 서버는 계속 처리하고 있어요. 끝나면 알아서 넘어가요.</p>}
            {verdict === "wait" && !lost && <p className="mt-4 text-[13px] text-muted">보통 10~30초 걸려요. 이 창을 닫거나 새로고침하지 않아도 끝나면 결과로 넘어가요.</p>}
            {verdict === "slow" && (
              <div className="mt-4 rounded-xl bg-field px-3.5 py-3 text-[14px] text-ink2">
                <p className="font-semibold text-ink">아직 처리 중이에요</p>
                <p className="mt-0.5">1분이 넘었어요. 새로고침해서 지금 상태를 확인해 보세요. 이미 끝났으면 다음 단계가 보여요.</p>
                <button type="button" onClick={reload} className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-[14px] font-semibold text-white">
                  <RotateCw size={16} aria-hidden="true" />새로고침
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
