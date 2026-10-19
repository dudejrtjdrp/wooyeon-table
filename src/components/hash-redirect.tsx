"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { hashTarget } from "@/lib/legacy-links";

/**
 * 예전 #해시 링크(#templates, #notice, #reports…)로 들어오면 나뉜 탭으로 옮긴다. 해시는 서버에 오지 않아 화면에서 한다.
 * 옮길 곳이 없으면 그 해시가 가리키는 칸이 접힌 <details> 안에 있을 때 펼쳐서 보여 준다
 */
export function HashRedirect({ rules }: { rules: Record<string, string> }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      const to = hashTarget(path, window.location.hash, window.location.search, rules);
      if (to) return router.replace(to);
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
      el.scrollIntoView({ block: "start" });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [path, router, rules]);
  return null;
}
