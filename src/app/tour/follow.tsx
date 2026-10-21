"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** PC에서 투어 단계(또는 내 신청 상태)가 바뀌면 이 화면을 새로 그린다. 몇 초마다 가볍게 물어본다 */
export function TourFollow({ sig, every = 4000 }: { sig: string; every?: number }) {
  const router = useRouter();
  const last = useRef(sig);
  useEffect(() => {
    last.current = sig;
  }, [sig]);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/tour-state", { cache: "no-store" });
        const j = (await r.json()) as { sig?: string };
        if (j.sig && j.sig !== last.current) {
          last.current = j.sig;
          router.refresh();
        }
      } catch {
        /* 다음 조회에서 다시 */
      }
    }, every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
