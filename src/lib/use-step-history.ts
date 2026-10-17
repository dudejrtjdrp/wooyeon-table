"use client";

import { useCallback, useEffect, useRef } from "react";

type StepState = { __prev?: number } & Record<string, unknown>;

/** 지금 주소의 ?step= 값 */
export function stepFromUrl(): number | null {
  const s = new URLSearchParams(window.location.search).get("step");
  const n = s === null ? NaN : Number(s);
  return Number.isInteger(n) ? n : null;
}

const urlWith = (n: number) => {
  const u = new URL(window.location.href);
  u.searchParams.set("step", String(n));
  u.searchParams.delete("e");
  return u.pathname + u.search + u.hash;
};

/**
 * 한 화면 안에서 단계를 넘기는 흐름(가입 프로필, 회차 신청)에서 휴대폰 뒤로 가기가
 * 흐름 첫 화면으로 돌아가지 않고 바로 앞 단계로 가게 한다.
 * 단계를 주소(?step=)에 남겨서, 결제 화면처럼 다음 화면에서 뒤로 와도 그 단계가 그대로 열린다.
 */
export function useStepHistory(step: number, apply: (n: number) => void, range: [number, number]) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const [min, max] = range;
  const clamp = useCallback((n: number) => Math.min(Math.max(n, min), max), [min, max]);

  useEffect(() => {
    // 다음 화면에서 뒤로 돌아왔거나 새로고침한 경우: 주소에 남은 단계를 연다
    const s = stepFromUrl();
    if (s !== null) applyRef.current(clamp(s));
    const onPop = () => {
      const n = stepFromUrl();
      applyRef.current(clamp(n ?? min));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장해 둔 단계로 이어 온 경우처럼 단계가 주소와 다르면 지금 기록만 맞춘다(기록은 늘리지 않음).
  // 처음 그릴 때는 건너뛴다: 주소의 단계를 읽어 오기 전 초기값으로 주소를 덮어쓰면 안 된다.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (stepFromUrl() !== step && !(stepFromUrl() === null && step === min)) {
      window.history.replaceState(window.history.state, "", urlWith(step));
    }
  }, [step, min]);

  /** 다음 단계로: 기록을 하나 쌓는다 */
  const push = useCallback((n: number) => {
    const st = (window.history.state ?? {}) as StepState;
    window.history.pushState({ ...st, __prev: step }, "", urlWith(n));
    applyRef.current(n);
  }, [step]);

  /**
   * 화면 안 '이전 단계' 버튼. 바로 앞 기록이 그 단계면 휴대폰 뒤로 가기와 똑같이 되돌리고,
   * 아니면(저장해 둔 단계로 이어 온 경우) 지금 기록을 그 단계로 바꾼다.
   */
  const back = useCallback((to: number) => {
    const st = (window.history.state ?? {}) as StepState;
    if (st.__prev === to) window.history.back();
    else {
      window.history.replaceState({ ...st, __prev: undefined }, "", urlWith(to));
      applyRef.current(to);
    }
  }, []);

  return { push, back };
}
