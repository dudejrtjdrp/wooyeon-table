"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 단체방 새 메시지 확인. 2.5초마다 마지막 메시지 시각만 물어보고, 바뀌었을 때만 화면을 다시 그린다.
 * 화면을 안 보고 있을 때는 묻지 않는다.
 */
export function Refresher({ tableId, ms = 2500 }: { tableId: string; ms?: number }) {
  const router = useRouter();
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/tables/${tableId}/latest`, { cache: "no-store" });
        const { last: l } = await r.json();
        if (last.current !== undefined && l !== last.current) {
          router.refresh();
          setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 300);
        }
        last.current = l;
      } catch {}
    };
    check();
    const id = setInterval(() => !stop && check(), ms);
    const vis = () => !document.hidden && check();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [router, tableId, ms]);
  return null;
}
