"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isNavClick, trickle } from "@/lib/ui-geometry";

/**
 * 화면을 옮기는 동안 맨 위에 뜨는 얇은 진행 막대.
 * App Router는 이동 시작 이벤트가 없어서 링크 클릭·GET 폼 제출로 시작을 알고(서버 액션 폼은 버튼이 '처리 중'을 보여 준다),
 * 주소(경로·쿼리)가 바뀌면 끝낸다. 15초 안에 안 끝나면 그냥 접는다
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [p, setP] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (giveUp.current) clearTimeout(giveUp.current);
    timer.current = giveUp.current = null;
  };

  const finish = () => {
    if (!timer.current && !giveUp.current) return;
    stop();
    setP(100);
    setTimeout(() => setP(null), 260);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const start = () => {
      stop();
      setP(8);
      timer.current = setInterval(() => setP((x) => (x === null ? x : trickle(x))), 200);
      giveUp.current = setTimeout(() => finishRef.current(), 15000);
    };
    // next/link가 먼저 preventDefault를 하므로 캡처 단계에서 본다
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (isNavClick(a.getAttribute("href"), location.href, { target: a.getAttribute("target"), download: a.hasAttribute("download"), modifier: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, button: e.button })) start();
    };
    // 조건으로 찾기 같은 GET 폼은 주소를 바꾸며 화면을 다시 연다
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const f = e.target as HTMLFormElement;
      if ((f.getAttribute("method") ?? "get").toLowerCase() === "get" && !f.getAttribute("action")?.startsWith("javascript")) start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      stop();
    };
  }, []);

  // 주소가 바뀌면 이동이 끝난 것. 다만 뼈대(loading.tsx, data-skeleton)가 떠 있으면 내용이 들어올 때까지 막대를 이어 간다
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const busy = () => !!document.querySelector("[data-skeleton]");
    if (!busy()) { finishRef.current(); return; }
    const mo = new MutationObserver(() => { if (!busy()) { mo.disconnect(); finishRef.current(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pathname, search]);

  if (p === null) return null;
  return (
    <div
      role="progressbar"
      aria-label="화면 불러오는 중"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[1100] h-[3px]"
    >
      <div className="nav-progress h-full origin-left transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${p}%`, opacity: p >= 100 ? 0 : 1 }} />
    </div>
  );
}
